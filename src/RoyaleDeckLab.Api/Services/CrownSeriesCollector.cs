using System.Collections.Concurrent;
using Microsoft.Extensions.Options;
using Polly.CircuitBreaker;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

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
    TimeProvider time,
    IOptions<CrownSeriesOptions> options,
    IOptions<MetaOptions> metaOptions,
    ILogger<CrownSeriesCollector> logger)
{
    // Rounds are stored this many players at a time, so a poll cut short keeps what it read.
    private const int PlayersPerFlush = 500;

    private readonly CrownSeriesOptions _opt = options.Value;

    public async Task CollectAsync(CancellationToken ct = default)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        var cutoff = now - metaOptions.Value.BattleWindowMs;
        var pruned = await store.PruneAsync(cutoff, ct);
        var harvest = new Harvest(cutoff);
        try
        {
            await PollAsync(harvest, now, ct);
        }
        catch (BrokenCircuitException)
        {
            logger.LogWarning("The CR API is refusing crawl requests; Crown Series poll stopped after {Players} players",
                harvest.PlayersRead);
        }

        harvest.Added += await store.MergeRoundsAsync(harvest.TakePending(), ct);
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
    }

    private async Task PollAsync(Harvest harvest, long now, CancellationToken ct)
    {
        var ranked = await client.GetTopRankedPlayerTagsAsync(_opt.RankedPlayers, ct);
        schedule.ForgetInactive(ranked, now);
        if (!await IsDuelWeekendOnAsync(ranked, harvest, now, ct))
        {
            logger.LogInformation("No Crown Series Duel weekend on: no Duels in the last {Hours} h", _opt.LiveDuelWindowMs / 3_600_000.0);
            return;
        }

        var due = ranked
            .Concat(schedule.KnownTags())
            .Distinct(StringComparer.Ordinal)
            .Where(tag => !harvest.WasRead(tag))
            .Where(tag => schedule.IsDue(tag, now))
            .ToList();
        await ReadAsync(due, harvest, now, ct);
        await ReadSeedsAsync(harvest, now, ct);
        schedule.Trim(ranked);

        var newOpponents = harvest.Opponents()
            .Where(o => !schedule.IsKnown(o.Tag))
            .GroupBy(o => o.Cap)
            .SelectMany(atCap => atCap.Take(schedule.RoomAt(atCap.Key)).Select(o => o.Tag))
            .ToList();
        await ReadAsync(newOpponents, harvest, now, ct);
        schedule.Trim(ranked);
    }

    /// <summary>
    /// Tries players who aren't tracked yet, the likeliest to play below King's League first; the ones who play Duels
    /// bring in their league's opponents from then on. Visitors are tried whatever the room: they are the site's own
    /// users, in every league.
    /// </summary>
    private async Task ReadSeedsAsync(Harvest harvest, long now, CancellationToken ct)
    {
        var seeds = new SeedPicks(_opt.SeedsPerPoll, tag => !harvest.WasRead(tag));
        seeds.Pick(SeedSource.Visitor, schedule.TakeVisitors(now, _opt.VisitorsPerPoll));
        var capsWithRoom = schedule.LowerCapsWithRoom();
        if (capsWithRoom.Count > 0)
        {
            await PickClanmatesAsync(seeds, harvest, capsWithRoom, now, ct);
            seeds.Pick(SeedSource.MetNearby, harvest.Leads()
                .Where(lead => capsWithRoom.Contains(lead.Cap))
                .Select(lead => lead.Tag)
                .Where(tag => schedule.IsSeedDue(tag, now)));
            var warPlayers = battles.PlayerTags().ToArray();
            Random.Shared.Shuffle(warPlayers);
            seeds.Pick(SeedSource.WarCrawl, warPlayers.Where(tag => schedule.IsSeedDue(tag, now)));
        }

        foreach (var tag in seeds.Tags)
        {
            schedule.RecordSeedTried(tag, now);
        }
        harvest.AddSeedsTried(seeds.CountBySource);
        await ReadAsync(seeds.Tags, harvest, now, ct);
        harvest.AddSeedsBelowKings(seeds.CountBySource.Keys.ToDictionary(
            source => source,
            source => seeds.TagsFrom(source).Count(tag => schedule.CapOf(tag) < LevelModel.MaxDisplayLevel)));
    }

    /// <summary>
    /// The members of the clans of lower-league players read this poll, at caps that still have room. Clans come
    /// before the other-mode opponents, which are many more and would leave no room; a clan whose members didn't all
    /// fit isn't marked tried, so it's asked again next poll.
    /// </summary>
    private async Task PickClanmatesAsync(
        SeedPicks seeds, Harvest harvest, IReadOnlySet<int> capsWithRoom, long now, CancellationToken ct)
    {
        if (!seeds.HasRoom)
        {
            return;
        }
        var clans = harvest.LeadClans()
            .Where(clan => capsWithRoom.Contains(clan.Cap))
            .Where(clan => schedule.IsClanDue(clan.Tag, now))
            .Select(clan => clan.Tag)
            .Take(_opt.ClansPerPoll)
            .ToList();

        var members = new ConcurrentDictionary<string, IReadOnlyList<string>>(StringComparer.Ordinal);
        var parallel = new ParallelOptions { MaxDegreeOfParallelism = CrawlConcurrency.MaxRequests, CancellationToken = ct };
        await Parallel.ForEachAsync(clans, parallel, async (clan, token) =>
            members[clan] = await ClanMembersAsync(clan, harvest, token));

        foreach (var clan in clans)
        {
            var allFit = seeds.Pick(SeedSource.Clanmate, members.GetValueOrDefault(clan, [])
                .Where(tag => schedule.IsSeedDue(tag, now)));
            if (!allFit)
            {
                return;
            }
            schedule.RecordClanTried(clan, now);
        }
    }

    private async Task<IReadOnlyList<string>> ClanMembersAsync(string clanTag, Harvest harvest, CancellationToken ct)
    {
        try
        {
            return await client.GetClanMemberTagsAsync(clanTag, ct);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            harvest.AddFailedRead(ex.GetType().Name);
            return [];
        }
    }

    private enum SeedSource
    {
        Visitor,
        MetNearby,
        Clanmate,
        WarCrawl,
    }

    /// <summary>One poll's seeds: at most <paramref name="limit"/>, each tag once, and only the ones <paramref name="isDue"/>.</summary>
    private sealed class SeedPicks(int limit, Func<string, bool> isDue)
    {
        private readonly List<string> _tags = [];
        private readonly Dictionary<string, SeedSource> _sourceByTag = new(StringComparer.Ordinal);

        public IReadOnlyList<string> Tags => _tags;

        public bool HasRoom => _tags.Count < limit;

        public Dictionary<SeedSource, int> CountBySource { get; } = [];

        public IEnumerable<string> TagsFrom(SeedSource source)
            => _sourceByTag
                .Where(s => s.Value == source)
                .Select(s => s.Key);

        /// <returns>Whether every tag due fit within the limit.</returns>
        public bool Pick(SeedSource source, IEnumerable<string> tags)
        {
            foreach (var tag in tags)
            {
                if (!HasRoom)
                {
                    return false;
                }
                if (!isDue(tag) || !_sourceByTag.TryAdd(tag, source))
                {
                    continue;
                }
                _tags.Add(tag);
                CountBySource[source] = CountBySource.GetValueOrDefault(source) + 1;
            }
            return true;
        }
    }

    private async Task<bool> IsDuelWeekendOnAsync(IReadOnlyList<string> ranked, Harvest harvest, long now, CancellationToken ct)
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
        await ReadAsync(probe, harvest, now, ct);
        return harvest.HasDuelSince(since);
    }

    private async Task ReadAsync(IReadOnlyList<string> tags, Harvest harvest, long now, CancellationToken ct)
    {
        var parallel = new ParallelOptions { MaxDegreeOfParallelism = CrawlConcurrency.MaxRequests, CancellationToken = ct };
        foreach (var chunk in tags.Chunk(PlayersPerFlush))
        {
            try
            {
                await Parallel.ForEachAsync(chunk, parallel, async (tag, token) => await ReadLogAsync(tag, harvest, now, token));
            }
            finally
            {
                harvest.Added += await store.MergeRoundsAsync(harvest.TakePending(), ct);
            }
        }
    }

    /// <summary>
    /// One player's log that can't be read leaves the poll to the others: the CR API fails single requests now and
    /// then, in more ways than a timeout or a bad status. Only a refusing API or a shutdown stops the poll.
    /// </summary>
    private async Task ReadLogAsync(string tag, Harvest harvest, long now, CancellationToken ct)
    {
        harvest.MarkRead(tag);
        try
        {
            var log = await client.GetPlayerBattlelogAsync(tag, ct);
            schedule.RecordRead(tag, log, now);
            harvest.Add(log);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            harvest.AddFailedRead(ex.GetType().Name);
        }
    }

    /// <summary>The Duels read in one poll, newer than <paramref name="cutoffMs"/>: older ones are past the window the store keeps.</summary>
    private sealed class Harvest(long cutoffMs)
    {
        private readonly object _lock = new();
        private readonly HashSet<string> _read = new(StringComparer.Ordinal);
        private readonly HashSet<string> _seenRounds = new(StringComparer.Ordinal);
        private readonly Dictionary<string, int> _opponentCaps = new(StringComparer.Ordinal);
        private readonly Dictionary<int, int> _roundsPerCap = [];
        private List<CrownSeriesRound> _pending = [];
        private long _latestDuelMs;
        private int _failedReads;
        private int _roundsFound;
        private int _incompleteDuels;

        private readonly Dictionary<string, int> _leads = new(StringComparer.Ordinal);
        private readonly Dictionary<string, int> _leadClans = new(StringComparer.Ordinal);

        public int Added { get; set; }
        public Dictionary<SeedSource, int> SeedsTried { get; } = [];

        /// <summary>Per source, the seeds whose latest Duel was below King's League: what each source is worth.</summary>
        public Dictionary<SeedSource, int> SeedsBelowKings { get; } = [];
        public HashSet<string> UnknownModes { get; } = new(StringComparer.Ordinal);

        public int PlayersRead
        {
            get
            {
                lock (_lock)
                {
                    return _read.Count;
                }
            }
        }

        public int FailedReads => Volatile.Read(ref _failedReads);

        public HashSet<string> FailureKinds { get; } = new(StringComparer.Ordinal);

        public int IncompleteDuels
        {
            get
            {
                lock (_lock)
                {
                    return _incompleteDuels;
                }
            }
        }

        public int RoundsFound
        {
            get
            {
                lock (_lock)
                {
                    return _roundsFound;
                }
            }
        }

        public void MarkRead(string tag)
        {
            lock (_lock)
            {
                _read.Add(tag);
            }
        }

        public bool WasRead(string tag)
        {
            lock (_lock)
            {
                return _read.Contains(tag);
            }
        }

        public void AddFailedRead(string kind)
        {
            Interlocked.Increment(ref _failedReads);
            lock (_lock)
            {
                FailureKinds.Add(kind);
            }
        }

        public bool HasDuelSince(long ms)
        {
            lock (_lock)
            {
                return _latestDuelMs >= ms;
            }
        }

        /// <summary>The players met in the Duels read and not read themselves yet, with the cap they met at.</summary>
        public IReadOnlyList<(string Tag, int Cap)> Opponents()
        {
            lock (_lock)
            {
                return _opponentCaps
                    .Where(o => !_read.Contains(o.Key))
                    .Select(o => (o.Key, o.Value))
                    .ToList();
            }
        }

        public void AddSeedsTried(IReadOnlyDictionary<SeedSource, int> bySource) => AddTo(SeedsTried, bySource);

        public void AddSeedsBelowKings(IReadOnlyDictionary<SeedSource, int> bySource) => AddTo(SeedsBelowKings, bySource);

        private static void AddTo(Dictionary<SeedSource, int> totals, IReadOnlyDictionary<SeedSource, int> bySource)
        {
            foreach (var (source, count) in bySource)
            {
                totals[source] = totals.GetValueOrDefault(source) + count;
            }
        }

        /// <summary>The players lower-league players met in other modes and not read yet, with the cap they were met from.</summary>
        public IReadOnlyList<(string Tag, int Cap)> Leads()
        {
            lock (_lock)
            {
                return _leads
                    .Where(l => !_read.Contains(l.Key))
                    .Select(l => (l.Key, l.Value))
                    .ToList();
            }
        }

        /// <summary>The clans of the lower-league players read, with their cap.</summary>
        public IReadOnlyList<(string Tag, int Cap)> LeadClans()
        {
            lock (_lock)
            {
                return _leadClans
                    .Select(c => (c.Key, c.Value))
                    .ToList();
            }
        }

        public IReadOnlyDictionary<int, int> RoundsPerCap()
        {
            lock (_lock)
            {
                return _roundsPerCap.OrderBy(c => c.Key).ToDictionary(c => c.Key, c => c.Value);
            }
        }

        public List<CrownSeriesRound> TakePending()
        {
            lock (_lock)
            {
                var pending = _pending;
                _pending = [];
                return pending;
            }
        }

        public void Add(IReadOnlyList<CrBattle> log)
        {
            lock (_lock)
            {
                var duels = new List<(int Cap, long TimeMs)>();
                foreach (var battle in log)
                {
                    if (AddBattle(battle) is { } duel)
                    {
                        duels.Add(duel);
                    }
                }
                if (duels.Count == 0)
                {
                    return;
                }
                var latestCap = duels.MaxBy(d => d.TimeMs).Cap;
                if (latestCap < LevelModel.MaxDisplayLevel)
                {
                    AddLeads(log, latestCap);
                }
            }
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
                _leads.TryAdd(tag, cap);
            }
            var clanTag = log
                .Select(b => b.Team?.FirstOrDefault()?.Clan?.Tag)
                .FirstOrDefault(tag => !string.IsNullOrEmpty(tag));
            if (clanTag is not null)
            {
                _leadClans.TryAdd(clanTag, cap);
            }
        }

        /// <summary>Stores a complete Duel's rounds, and returns its cap and time; null for any other battle.</summary>
        private (int Cap, long TimeMs)? AddBattle(CrBattle battle)
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
                return null;
            }
            foreach (var round in rounds)
            {
                if (round.BattleTimeMs < cutoffMs)
                {
                    continue;
                }
                _opponentCaps[round.PlayerTag] = cap;
                if (!_seenRounds.Add(round.Key))
                {
                    continue;
                }
                _pending.Add(round);
                _roundsFound++;
                _roundsPerCap[cap] = _roundsPerCap.GetValueOrDefault(cap) + 1;
                _latestDuelMs = Math.Max(_latestDuelMs, round.BattleTimeMs);
            }
            return (cap, rounds[0].BattleTimeMs);
        }
    }
}
