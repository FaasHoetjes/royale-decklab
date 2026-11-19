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
/// Stores the Crown Series Duels of the top Ranked players and of the opponents they met there, who play in the same
/// league. The Ranked players are nearly all in King's League, so seeds are tried for the leagues below it: the site's
/// Crown Series visitors, the clanmates and other-mode opponents of lower-league players, and war crawl players. Each
/// league cap then follows its own opponents up to its share of the reads.
/// </summary>
public sealed class CrownSeriesCollector(
    ClashRoyaleCrawlClient client,
    CrownSeriesRepository store,
    BattleRepository battles,
    CrownSeriesSchedule schedule,
    LadderIntake ladder,
    TimeProvider time,
    IOptions<CrownSeriesOptions> options,
    IOptions<MetaOptions> metaOptions,
    ILogger<CrownSeriesCollector> logger)
{
    private readonly CrownSeriesOptions _opt = options.Value;

    /// <returns>Whether any rounds were added or pruned, so the decks need building again.</returns>
    public async Task<bool> CollectAsync(CancellationToken ct = default)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        var cutoff = now - metaOptions.Value.BattleWindowMs;
        var pruned = await store.PruneAsync(cutoff, ct);
        var harvest = new Harvest(cutoff);
        var poll = new PlayerPoll<int>(client, ladder, schedule, harvest, _opt,
            async token => harvest.Added += await store.MergeRoundsAsync(harvest.TakePending(), token), now);
        try
        {
            await PollAsync(poll, harvest, now, ct);
        }
        catch (BrokenCircuitException)
        {
            logger.LogWarning("The CR API is refusing crawl requests; Crown Series poll stopped after {Players} players",
                harvest.PlayersRead);
        }

        await poll.FlushAsync(ct);
        poll.ReportLadder("Crown Series poll");
        await store.SetLastPollMsAsync(now, ct);
        logger.LogInformation(
            "Crown Series poll: {Players} players read ({Failed} failed), {Rounds} rounds found, +{Added} new, {Pruned} pruned, "
            + "{Incomplete} incomplete Duels skipped, seeds tried: {@Seeds}, "
            + "of them below King's: {@SeedsBelowKings}, {Tracked} players tracked; "
            + "rounds found per cap: {@RoundsPerCap}, players tracked per cap: {@PlayersPerCap}",
            harvest.PlayersRead, harvest.FailedReads, harvest.RoundsFound, harvest.Added, pruned, harvest.IncompleteDuels,
            harvest.SeedsTried, harvest.SeedsBelowKings, schedule.KnownPlayers, harvest.RoundsPerCap(), schedule.PlayersPerCap());
        if (harvest.FailureKinds.Count > 0)
        {
            logger.LogWarning("Some battle logs couldn't be read: {@Errors}", harvest.FailureKinds);
        }
        if (harvest.UnknownModes.Count > 0)
        {
            logger.LogWarning("Skipped multi-deck battles of modes that aren't the Crown Series Duel: {@Modes}",
                harvest.UnknownModes);
        }
        return harvest.Added > 0 || pruned > 0;
    }

    private async Task PollAsync(PlayerPoll<int> poll, Harvest harvest, long now, CancellationToken ct)
    {
        var ranked = await client.GetTopRankedPlayerTagsAsync(_opt.RankedPlayers, ct);
        schedule.ForgetInactive(ranked, now);
        if (!await IsDuelWeekendOnAsync(poll, ranked, harvest, now, ct))
        {
            logger.LogInformation("No Crown Series Duel weekend on: no Duels in the last {Hours} h", _opt.LiveDuelWindowMs / 3_600_000.0);
            return;
        }

        await poll.ReadAsync(ranked.Where(tag => schedule.IsDue(tag, now)).Concat(schedule.DueTags(now)), ct);
        await ReadSeedsAsync(poll, harvest, now, ct);
        schedule.Trim(ranked);
        await poll.FollowOpponentsAsync(ranked, cap => cap < LevelModel.MaxDisplayLevel, ct);
    }

    /// <summary>
    /// Tries players who aren't tracked yet, the likeliest to play below King's League first; the ones who play Duels
    /// bring in their league's opponents from then on. Visitors are tried whatever the room: they are the site's own
    /// users, in every league. Clans come before the other-mode opponents, which are many more and would leave no room.
    /// </summary>
    private async Task ReadSeedsAsync(PlayerPoll<int> poll, Harvest harvest, long now, CancellationToken ct)
    {
        var seeds = new SeedPicks<SeedSource>(_opt.SeedsPerPoll, tag => !harvest.WasRead(tag));
        seeds.Pick(SeedSource.Visitor, schedule.TakeVisitors(now, _opt.VisitorsPerPoll));
        var capsWithRoom = schedule.LowerCapsWithRoom();
        if (capsWithRoom.Count > 0)
        {
            var clans = harvest.LeadClans()
                .OrderBy(clan => clan.Group)
                .Where(clan => capsWithRoom.Contains(clan.Group))
                .Select(clan => clan.Tag);
            await poll.PickClanmatesAsync(seeds, SeedSource.Clanmate, clans, ct);
            seeds.Pick(SeedSource.MetNearby, harvest.Leads()
                .Where(lead => capsWithRoom.Contains(lead.Group))
                .Select(lead => lead.Tag)
                .Where(tag => schedule.IsSeedDue(tag, now)));
            if (seeds.HasRoom)
            {
                var warPlayers = schedule.WarPlayers(battles.PlayerTags, now).ToArray();
                Random.Shared.Shuffle(warPlayers);
                seeds.Pick(SeedSource.WarCrawl, warPlayers.Where(tag => schedule.IsSeedDue(tag, now)));
            }
        }

        harvest.SeedsTried = seeds.CountBySource;
        await poll.ReadSeedsAsync(seeds.Tags, ct);
        harvest.SeedsBelowKings = seeds.CountBySource.Keys.ToDictionary(
            source => source,
            source => seeds.TagsFrom(source).Count(tag => schedule.GroupOf(tag) < LevelModel.MaxDisplayLevel));
    }

    private enum SeedSource
    {
        Visitor,
        MetNearby,
        Clanmate,
        WarCrawl,
    }

    private async Task<bool> IsDuelWeekendOnAsync(
        PlayerPoll<int> poll, IReadOnlyList<string> ranked, Harvest harvest, long now, CancellationToken ct)
    {
        var since = now - _opt.LiveDuelWindowMs;
        if (store.LatestBattleTimeMs() >= since)
        {
            return true;
        }

        var probe = store.MostActivePlayers(_opt.ProbePlayers);
        if (probe.Count == 0)
        {
            probe = ranked.Take(_opt.ProbePlayers).ToList();
        }
        await poll.ReadAsync(probe, ct);
        return harvest.HasDuelSince(since);
    }

    /// <summary>The Duels read in one poll, newer than <paramref name="cutoffMs"/>: older ones are past the window the store keeps.</summary>
    private sealed class Harvest(long cutoffMs) : PollHarvest<int>
    {
        private readonly HashSet<string> _seenRounds = new(StringComparer.Ordinal);
        private readonly Dictionary<int, int> _roundsPerCap = [];
        private List<CrownSeriesRound> _pending = [];
        private long _latestDuelMs;
        private int _roundsFound;
        private int _incompleteDuels;

        public int Added { get; set; }

        public IReadOnlyDictionary<SeedSource, int> SeedsTried { get; set; } = new Dictionary<SeedSource, int>();

        /// <summary>Per source, the seeds whose latest Duel was below King's League: what each source is worth.</summary>
        public IReadOnlyDictionary<SeedSource, int> SeedsBelowKings { get; set; } = new Dictionary<SeedSource, int>();

        public HashSet<string> UnknownModes { get; } = new(StringComparer.Ordinal);

        public int IncompleteDuels
        {
            get
            {
                lock (Lock)
                {
                    return _incompleteDuels;
                }
            }
        }

        public int RoundsFound
        {
            get
            {
                lock (Lock)
                {
                    return _roundsFound;
                }
            }
        }

        public bool HasDuelSince(long ms)
        {
            lock (Lock)
            {
                return _latestDuelMs >= ms;
            }
        }

        public IReadOnlyDictionary<int, int> RoundsPerCap()
        {
            lock (Lock)
            {
                return _roundsPerCap.OrderBy(c => c.Key).ToDictionary(c => c.Key, c => c.Value);
            }
        }

        public List<CrownSeriesRound> TakePending()
        {
            lock (Lock)
            {
                var pending = _pending;
                _pending = [];
                return pending;
            }
        }

        protected override (int? Group, long SeenMs) AddLog(
            string tag, IReadOnlyList<CrBattle> log, IReadOnlyList<LadderBattle> ladderSides)
        {
            foreach (var battle in log)
            {
                AddBattle(battle);
            }
            var latest = CrownSeriesRounds.LatestCap(log);
            if (latest.Cap is { } cap && cap < LevelModel.MaxDisplayLevel)
            {
                AddLeads(log, cap);
            }
            return latest;
        }

        /// <summary>
        /// Lower-league players are hard to find, so the players around one are worth trying: their other-mode
        /// opponents and clanmates are likely near their level.
        /// </summary>
        private void AddLeads(IReadOnlyList<CrBattle> log, int cap)
        {
            var otherModeOpponents = log
                .Where(b => !CrownSeriesRounds.IsCrownSeries(b))
                .SelectMany(b => b.Opponent ?? [])
                .Select(o => o.Tag)
                .OfType<string>();
            foreach (var tag in otherModeOpponents)
            {
                AddLead(tag, cap);
            }
            AddLeadClan(log, cap);
        }

        private void AddBattle(CrBattle battle)
        {
            if (CrownSeriesRounds.UnknownMultiDeckMode(battle) is { } mode)
            {
                UnknownModes.Add(mode);
            }
            var rounds = CrownSeriesRounds.From(battle);
            if (CrownSeriesRounds.IsCrownSeries(battle) && rounds.Count == 0)
            {
                _incompleteDuels++;
            }
            if (CrownSeriesRounds.CapOf(rounds) is not { } cap)
            {
                return;
            }
            foreach (var round in rounds)
            {
                if (round.BattleTimeMs < cutoffMs)
                {
                    continue;
                }
                AddOpponent(round.PlayerTag, cap);
                if (!_seenRounds.Add(round.Key))
                {
                    continue;
                }
                _pending.Add(round);
                _roundsFound++;
                _roundsPerCap[cap] = _roundsPerCap.GetValueOrDefault(cap) + 1;
                _latestDuelMs = Math.Max(_latestDuelMs, round.BattleTimeMs);
            }
        }
    }
}
