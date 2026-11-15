using System.Text.Json;
using Microsoft.Extensions.Options;
using Polly.CircuitBreaker;
using Polly.Timeout;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Stores the Crown Series Duels of the top Ranked players and of the opponents they met there, who play in the same
/// league.
/// </summary>
public sealed class CrownSeriesCollector(
    ClashRoyaleCrawlClient client,
    CrownSeriesRepository store,
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
            "Crown Series poll: {Players} players read ({Failed} failed), {Rounds} rounds found, +{Added} new, {Pruned} pruned",
            harvest.PlayersRead, harvest.FailedReads, harvest.RoundsFound, harvest.Added, pruned);
        if (harvest.UnknownModes.Count > 0)
        {
            logger.LogWarning("Skipped multi-deck battles of modes that aren't the Crown Series Duel: {@Modes}",
                harvest.UnknownModes);
        }
    }

    private async Task PollAsync(Harvest harvest, long now, CancellationToken ct)
    {
        var ranked = await client.GetTopRankedPlayerTagsAsync(_opt.RankedPlayers, ct);
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

        var room = Math.Max(0, _opt.MaxPlayers - schedule.KnownPlayers);
        var newOpponents = harvest.Opponents()
            .Where(tag => !schedule.IsKnown(tag))
            .Take(room)
            .ToList();
        await ReadAsync(newOpponents, harvest, now, ct);
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
            await Parallel.ForEachAsync(chunk, parallel, async (tag, token) => await ReadLogAsync(tag, harvest, now, token));
            harvest.Added += await store.MergeRoundsAsync(harvest.TakePending(), ct);
        }
    }

    /// <summary>One player's log that can't be read leaves the poll to the others: the CR API fails single requests now and then.</summary>
    private async Task ReadLogAsync(string tag, Harvest harvest, long now, CancellationToken ct)
    {
        harvest.MarkRead(tag);
        try
        {
            var log = await client.GetPlayerBattlelogAsync(tag, ct);
            schedule.RecordRead(tag, log, now);
            harvest.Add(log);
        }
        catch (Exception ex) when (ex is HttpRequestException or TimeoutRejectedException or JsonException)
        {
            harvest.AddFailedRead();
        }
    }

    /// <summary>The Duels read in one poll, newer than <paramref name="cutoffMs"/>: older ones are past the window the store keeps.</summary>
    private sealed class Harvest(long cutoffMs)
    {
        private readonly object _lock = new();
        private readonly HashSet<string> _read = new(StringComparer.Ordinal);
        private readonly HashSet<string> _seenRounds = new(StringComparer.Ordinal);
        private readonly HashSet<string> _opponents = new(StringComparer.Ordinal);
        private List<CrownSeriesRound> _pending = [];
        private long _latestDuelMs;
        private int _failedReads;
        private int _roundsFound;

        public int Added { get; set; }
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

        public void AddFailedRead() => Interlocked.Increment(ref _failedReads);

        public bool HasDuelSince(long ms)
        {
            lock (_lock)
            {
                return _latestDuelMs >= ms;
            }
        }

        public IReadOnlyList<string> Opponents()
        {
            lock (_lock)
            {
                return _opponents.Where(tag => !_read.Contains(tag)).ToList();
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
            foreach (var round in CrownSeriesRounds.From(battle))
            {
                if (round.BattleTimeMs < cutoffMs)
                {
                    continue;
                }
                _opponents.Add(round.PlayerTag);
                if (!_seenRounds.Add(round.Key))
                {
                    continue;
                }
                _pending.Add(round);
                _roundsFound++;
                _latestDuelMs = Math.Max(_latestDuelMs, round.BattleTimeMs);
            }
        }
    }
}
