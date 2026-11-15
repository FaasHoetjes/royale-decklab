using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Which players the Crown Series poll tracks, and when each one's battle log is next worth reading: after half the
/// time the log took to fill, so it's read again long before its oldest Duel drops out.
/// </summary>
public sealed class CrownSeriesSchedule(IOptions<CrownSeriesOptions> options)
{
    private readonly CrownSeriesOptions _opt = options.Value;
    private readonly object _lock = new();
    private readonly Dictionary<string, Tracked> _players = new(StringComparer.Ordinal);

    private sealed record Tracked(long NextReadMs, long LastDuelMs);

    public int KnownPlayers
    {
        get
        {
            lock (_lock)
            {
                return _players.Count;
            }
        }
    }

    public bool IsKnown(string tag)
    {
        lock (_lock)
        {
            return _players.ContainsKey(tag);
        }
    }

    public IReadOnlyList<string> KnownTags()
    {
        lock (_lock)
        {
            return _players.Keys.ToList();
        }
    }

    /// <summary>A player read within half a poll of being due is read now rather than an hour late.</summary>
    public bool IsDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.TryGetValue(tag, out var tracked) || tracked.NextReadMs <= nowMs + _opt.PollIntervalMs / 2;
        }
    }

    public void RecordRead(string tag, IReadOnlyList<CrBattle> log, long nowMs)
    {
        var maxWait = Math.Max(_opt.PollIntervalMs, _opt.MaxRereadIntervalMs);
        var wait = Math.Clamp(LogSpanMs(log) / 2, _opt.PollIntervalMs, maxWait);
        var latestDuelMs = log
            .Where(CrownSeriesRounds.IsCrownSeries)
            .Select(b => BattleRepository.ParseBattleTime(b.BattleTime))
            .DefaultIfEmpty(0)
            .Max();
        lock (_lock)
        {
            var lastDuelMs = Math.Max(latestDuelMs, _players.GetValueOrDefault(tag)?.LastDuelMs ?? 0);
            _players[tag] = new Tracked(nowMs + wait, lastDuelMs);
        }
    }

    /// <summary>Stops tracking the players who left the Ranked list and stopped playing Duels, which frees room for new opponents.</summary>
    public void ForgetInactive(IReadOnlyCollection<string> ranked, long nowMs)
    {
        var rankedTags = ranked.ToHashSet(StringComparer.Ordinal);
        var activeSince = nowMs - _opt.ForgetAfterMs;
        lock (_lock)
        {
            var inactive = _players
                .Where(p => !rankedTags.Contains(p.Key) && p.Value.LastDuelMs < activeSince)
                .Select(p => p.Key)
                .ToList();
            foreach (var tag in inactive)
            {
                _players.Remove(tag);
            }
        }
    }

    private long LogSpanMs(IReadOnlyList<CrBattle> log)
    {
        if (log.Count < 2)
        {
            return _opt.MaxRereadIntervalMs * 2;
        }
        var times = log.Select(b => BattleRepository.ParseBattleTime(b.BattleTime)).ToList();
        return times.Max() - times.Min();
    }
}
