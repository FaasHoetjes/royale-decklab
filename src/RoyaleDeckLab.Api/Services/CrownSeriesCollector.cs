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
/// league. The Ranked players are nearly all in King's League, so war crawl players are tried as seeds for the leagues
/// below it, and each league cap follows its own opponents up to its share of the reads.
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
            + "{Incomplete} incomplete Duels skipped, {Seeds} seeds tried, {Tracked} players tracked; "
            + "rounds found per cap: {@RoundsPerCap}, players tracked per cap: {@PlayersPerCap}",
            harvest.PlayersRead, harvest.FailedReads, harvest.RoundsFound, harvest.Added, pruned, harvest.IncompleteDuels,
            harvest.SeedsTried, schedule.KnownPlayers, harvest.RoundsPerCap(), schedule.PlayersPerCap());
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
    /// Tries war crawl players while a cap below King's has room; the ones who play Duels there bring in their league's
    /// opponents from then on.
    /// </summary>
    private async Task ReadSeedsAsync(Harvest harvest, long now, CancellationToken ct)
    {
        if (CrownSeriesCaps.All.Where(cap => cap < LevelModel.MaxDisplayLevel).All(cap => schedule.RoomAt(cap) == 0))
        {
            return;
        }

        var candidates = battles.PlayerTags()
            .Where(tag => !harvest.WasRead(tag) && schedule.IsSeedDue(tag, now))
            .ToArray();
        Random.Shared.Shuffle(candidates);
        var seeds = candidates.Take(_opt.SeedsPerPoll).ToList();
        foreach (var tag in seeds)
        {
            schedule.RecordSeedTried(tag, now);
        }
        harvest.SeedsTried += seeds.Count;
        await ReadAsync(seeds, harvest, now, ct);
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

        public int Added { get; set; }
        public int SeedsTried { get; set; }
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
                foreach (var battle in log)
                {
                    AddBattle(battle);
                }
            }
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
        }
    }
}
