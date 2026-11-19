using Microsoft.Extensions.Options;
using Polly.CircuitBreaker;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Reads the logs of ladder players in every Trophy Road range and Ranked league, up to each one's share. Ladder
/// matches players on trophies, so following a player's opponents fills their own range; the site's visitors and the
/// clanmates of players in ranges with room start the ranges no one is tracked in yet.
/// </summary>
public sealed class LadderCollector(
    ClashRoyaleCrawlClient client,
    LadderIntake ladder,
    LadderStore store,
    LadderSchedule schedule,
    CrownSeriesRepository duels,
    TimeProvider time,
    IOptions<LadderOptions> options,
    IOptions<CrownSeriesOptions> crownSeriesOptions,
    ILogger<LadderCollector> logger)
{
    private readonly LadderOptions _opt = options.Value;

    public async Task CollectAsync(CancellationToken ct = default)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        var budget = IsDuelWeekendOn(now) ? _opt.ReadsPerPollDuringDuels : _opt.ReadsPerPoll;
        var harvest = new Harvest(_opt, schedule.TakeMet());
        var poll = new PlayerPoll<LadderGroup>(client, ladder, schedule, harvest, _opt, _ => Task.CompletedTask, now, budget);
        var seedsTried = new Dictionary<SeedSource, int>();
        try
        {
            seedsTried = await PollAsync(poll, harvest, now, ct);
        }
        catch (BrokenCircuitException)
        {
            logger.LogWarning("The CR API is refusing crawl requests; ladder poll stopped after {Players} players",
                harvest.PlayersRead);
        }

        await poll.FlushAsync(ct);
        schedule.KeepMet(harvest.Opponents().Where(o => !harvest.WasMetEarlier(o.Tag)));
        poll.ReportLadder("ladder poll");
        store.SetLastPollMs(now);
        logger.LogInformation(
            "Ladder poll: {Players} of {Budget} reads used ({Failed} failed), seeds tried: {@Seeds}, {Tracked} players tracked; "
            + "per range: {PlayersPerGroup}",
            harvest.PlayersRead, budget, harvest.FailedReads, seedsTried, schedule.KnownPlayers, PlayersPerGroup());
        if (harvest.FailureKinds.Count > 0)
        {
            logger.LogWarning("Some battle logs couldn't be read: {@Errors}", harvest.FailureKinds);
        }
    }

    /// <summary>
    /// Rereads leave room for the seeds, so new ranges keep filling; whatever the seeds leave goes to opponents.
    /// Visitors are read before their clans are picked, so their clanmates are tried in the same poll.
    /// </summary>
    private async Task<Dictionary<SeedSource, int>> PollAsync(
        PlayerPoll<LadderGroup> poll, Harvest harvest, long now, CancellationToken ct)
    {
        schedule.ForgetInactive([], now);
        var reserved = Math.Min(_opt.SeedsPerPoll, poll.ReadsLeft / 2);
        await poll.ReadAsync(schedule.DueTags(now).Take(poll.ReadsLeft - reserved), ct);
        schedule.Trim([]);

        var seeds = poll.Seeds<SeedSource>(_opt.SeedsPerPoll);
        seeds.Pick(SeedSource.Visitor, schedule.TakeVisitors(now, Math.Min(_opt.VisitorsPerPoll, poll.ReadsLeft)));
        await poll.ReadSeedsAsync(seeds, ct);
        var clans = harvest.LeadClans()
            .Select(clan => (clan.Tag, Room: schedule.RoomIn(clan.Group)))
            .Where(clan => clan.Room > 0)
            .OrderByDescending(clan => clan.Room)
            .Select(clan => clan.Tag);
        await poll.PickClanmatesAsync(seeds, SeedSource.Clanmate, clans, ct);
        await poll.ReadSeedsAsync(seeds, ct);
        schedule.Trim([]);

        await poll.FollowOpponentsAsync([], _ => true, ct);
        return seeds.CountBySource;
    }

    private enum SeedSource
    {
        Visitor,
        Clanmate,
    }

    private bool IsDuelWeekendOn(long now)
        => duels.LatestBattleTimeMs() >= now - crownSeriesOptions.Value.LiveDuelWindowMs;

    private string PlayersPerGroup()
        => string.Join(", ", schedule.PlayersPerGroup()
            .OrderBy(g => g.Key.Mode)
            .ThenBy(g => g.Key.Floor)
            .Select(g => $"{g.Key}: {g.Value}"));

    public void RestoreSchedule()
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        var latest = store.LatestPerPlayer(_opt.MaxPlayersPerGroup, now - _opt.ForgetAfterMs)
            .Select(side => (side.PlayerTag, Group: LadderGroup.Of(side, _opt), side.BattleTimeMs))
            .Where(p => p.Group is not null)
            .Select(p => (p.PlayerTag, p.Group!.Value, p.BattleTimeMs));
        schedule.Restore(latest, now);
        logger.LogInformation("Ladder schedule restored: {Tracked} players tracked; per range: {PlayersPerGroup}",
            schedule.KnownPlayers, PlayersPerGroup());
    }

    /// <summary>Every ladder side a log holds is an opponent in that side's own range, the log owner's included.</summary>
    private sealed class Harvest : PollHarvest<LadderGroup>
    {
        private readonly LadderOptions _options;
        private readonly HashSet<string> _metEarlier = new(StringComparer.Ordinal);

        public Harvest(LadderOptions options, IEnumerable<(string Tag, LadderGroup Group)> metEarlier)
        {
            _options = options;
            foreach (var (tag, group) in metEarlier)
            {
                AddOpponent(tag, group);
                _metEarlier.Add(tag);
            }
        }

        public bool WasMetEarlier(string tag) => _metEarlier.Contains(tag);

        protected override (LadderGroup? Group, long SeenMs) AddLog(
            string tag, IReadOnlyList<CrBattle> log, IReadOnlyList<LadderBattle> ladderSides)
        {
            LadderBattle? latest = null;
            foreach (var side in ladderSides)
            {
                if (LadderGroup.Of(side, _options) is { } group)
                {
                    AddOpponent(side.PlayerTag, group);
                }
                if (side.PlayerTag == tag && (latest is null || side.BattleTimeMs > latest.BattleTimeMs))
                {
                    latest = side;
                }
            }
            if (latest is null)
            {
                return (null, 0);
            }
            if (LadderGroup.Of(latest, _options) is not { } ownGroup)
            {
                MarkLeft(tag);
                return (null, latest.BattleTimeMs);
            }
            AddLeadClan(log, ownGroup);
            return (ownGroup, latest.BattleTimeMs);
        }
    }
}
