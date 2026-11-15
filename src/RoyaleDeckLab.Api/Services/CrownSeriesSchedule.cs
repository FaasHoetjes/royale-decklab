using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Which players the Crown Series poll knows, and when each one's battle log is next worth reading: after half the
/// time the log took to fill, so it's read again long before its oldest Duel drops out.
/// </summary>
public sealed class CrownSeriesSchedule(IOptions<CrownSeriesOptions> options)
{
    private readonly CrownSeriesOptions _opt = options.Value;
    private readonly object _lock = new();
    private readonly Dictionary<string, long> _nextReadMs = new(StringComparer.Ordinal);

    public int KnownPlayers
    {
        get
        {
            lock (_lock)
            {
                return _nextReadMs.Count;
            }
        }
    }

    public bool IsKnown(string tag)
    {
        lock (_lock)
        {
            return _nextReadMs.ContainsKey(tag);
        }
    }

    public IReadOnlyList<string> KnownTags()
    {
        lock (_lock)
        {
            return _nextReadMs.Keys.ToList();
        }
    }

    /// <summary>A player read within half a poll of being due is read now rather than an hour late.</summary>
    public bool IsDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            var isUnknown = !_nextReadMs.TryGetValue(tag, out var nextMs);
            return isUnknown || nextMs <= nowMs + _opt.PollIntervalMs / 2;
        }
    }

    public void RecordRead(string tag, IReadOnlyList<CrBattle> log, long nowMs)
    {
        var wait = Math.Clamp(LogSpanMs(log) / 2, _opt.PollIntervalMs, _opt.MaxRereadIntervalMs);
        lock (_lock)
        {
            _nextReadMs[tag] = nowMs + wait;
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
