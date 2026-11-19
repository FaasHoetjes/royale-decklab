using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Tracks players by the level cap of their latest Duel.</summary>
public sealed class CrownSeriesSchedule(IOptions<CrownSeriesOptions> options) : PlayerTracker<int>(options.Value)
{
    private readonly CrownSeriesOptions _opt = options.Value;
    private readonly object _warLock = new();
    private (long FetchedMs, IReadOnlyList<string> Tags)? _warPlayers;

    public void RecordRead(string tag, IReadOnlyList<CrBattle> log, long nowMs)
    {
        var (cap, seenMs) = CrownSeriesRounds.LatestCap(log);
        RecordRead(tag, log, cap, seenMs, nowMs);
    }

    public void Restore(IReadOnlyList<CappedBattle> rounds, long nowMs)
        => Restore(rounds
            .GroupBy(r => r.Record.PlayerTag, StringComparer.Ordinal)
            .Select(g => g.MaxBy(r => r.Record.BattleTimeMs))
            .Select(r => (r.Record.PlayerTag, r.Cap, r.Record.BattleTimeMs)), nowMs);

    public IReadOnlyDictionary<int, int> PlayersPerCap() => new SortedDictionary<int, int>(PlayersPerGroup().ToDictionary());

    public IReadOnlySet<int> LowerCapsWithRoom()
        => CrownSeriesCaps.All
            .Where(cap => cap < LevelModel.MaxDisplayLevel && RoomIn(cap) > 0)
            .ToHashSet();

    public IReadOnlyList<string> WarPlayers(Func<IReadOnlyList<string>> load, long nowMs)
    {
        lock (_warLock)
        {
            if (_warPlayers is { } cached && cached.FetchedMs > nowMs - _opt.WarPlayersRefreshMs)
            {
                return cached.Tags;
            }
        }
        var tags = load();
        lock (_warLock)
        {
            _warPlayers = (nowMs, tags);
        }
        return tags;
    }
}
