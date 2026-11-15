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
    ClashRoyaleClient client,
    CrownSeriesRepository store,
    TimeProvider time,
    IOptions<CrownSeriesOptions> options,
    IOptions<MetaOptions> metaOptions,
    ILogger<CrownSeriesCollector> logger)
{
    private const int BatchSize = 10;

    private readonly CrownSeriesOptions _opt = options.Value;

    public async Task CollectAsync(CancellationToken ct = default)
    {
        var ranked = await client.GetTopRankedPlayerTagsAsync(_opt.RankedPlayers, ct);
        var harvest = new Harvest();

        await ReadLogsAsync(ranked.Take(_opt.ProbePlayers), harvest, ct);
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        if (!harvest.HasDuelSince(now - _opt.LiveDuelWindowMs))
        {
            logger.LogInformation("No Crown Series Duel weekend on: no recent Duels among the top {Players} Ranked players",
                harvest.PlayersRead);
            return;
        }

        await ReadLogsAsync(ranked.Skip(_opt.ProbePlayers), harvest, ct);
        var opponentsToRead = harvest.UnreadOpponents()
            .Take(Math.Max(0, _opt.MaxPlayers - harvest.PlayersRead))
            .ToList();
        await ReadLogsAsync(opponentsToRead, harvest, ct);

        var added = await store.MergeRoundsAsync(harvest.Rounds, ct);
        var pruned = await store.PruneAsync(now - metaOptions.Value.BattleWindowMs, ct);
        logger.LogInformation(
            "Crown Series poll: {Players} players read ({Failed} failed), {Rounds} rounds found, +{Added} new, {Pruned} pruned",
            harvest.PlayersRead, harvest.FailedReads, harvest.Rounds.Count, added, pruned);
        if (harvest.OtherMultiDeckBattles > 0)
        {
            logger.LogWarning("Skipped {Count} multi-deck battles of a mode that isn't the Crown Series Duel",
                harvest.OtherMultiDeckBattles);
        }
    }

    private async Task ReadLogsAsync(IEnumerable<string> tags, Harvest harvest, CancellationToken ct)
    {
        foreach (var batch in tags.Where(harvest.MarkRead).Chunk(BatchSize))
        {
            var logs = await Task.WhenAll(batch.Select(tag => ReadLogAsync(tag, ct)));
            foreach (var log in logs)
            {
                harvest.Add(log);
            }
        }
    }

    /// <summary>One player's log that can't be read leaves the poll to the others: the CR API fails single requests now and then.</summary>
    private async Task<LogRead> ReadLogAsync(string tag, CancellationToken ct)
    {
        try
        {
            return new LogRead.Read(await client.GetPlayerBattlelogAsync(tag, ct));
        }
        catch (Exception ex) when (ex is HttpRequestException or TimeoutRejectedException or BrokenCircuitException or JsonException)
        {
            return new LogRead.Failed();
        }
    }

    private abstract record LogRead
    {
        public sealed record Read(IReadOnlyList<CrBattle> Battles) : LogRead;

        public sealed record Failed : LogRead;
    }

    private sealed class Harvest
    {
        private readonly HashSet<string> _read = new(StringComparer.Ordinal);
        private readonly Dictionary<string, CrownSeriesRound> _rounds = new(StringComparer.Ordinal);

        public int PlayersRead => _read.Count;
        public int FailedReads { get; private set; }
        public int OtherMultiDeckBattles { get; private set; }
        public IReadOnlyCollection<CrownSeriesRound> Rounds => _rounds.Values;

        public bool MarkRead(string tag) => _read.Add(tag);

        public bool HasDuelSince(long ms) => _rounds.Values.Any(r => r.BattleTimeMs >= ms);

        public IEnumerable<string> UnreadOpponents()
            => _rounds.Values
                .Select(r => r.PlayerTag)
                .Where(tag => !_read.Contains(tag))
                .Distinct(StringComparer.Ordinal);

        public void Add(LogRead log)
        {
            if (log is not LogRead.Read read)
            {
                FailedReads++;
                return;
            }
            foreach (var battle in read.Battles)
            {
                if (CrownSeriesRounds.IsOtherMultiDeckBattle(battle))
                {
                    OtherMultiDeckBattles++;
                }
                foreach (var round in CrownSeriesRounds.From(battle))
                {
                    _rounds.TryAdd(round.Key, round);
                }
            }
        }
    }
}
