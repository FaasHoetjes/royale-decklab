using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services.Crawling;

public class PlayerTracker<TGroup>(PlayerPollOptions options) where TGroup : struct
{
    private const int MaxWaitingVisitors = 10_000;

    private readonly PlayerPollOptions _opt = options;
    private readonly object _lock = new();
    private readonly Dictionary<string, Tracked> _players = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _seedsDueMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _seedsFailedMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _clansTriedMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _leftMs = new(StringComparer.Ordinal);

    private readonly Dictionary<string, Visitor> _waitingVisitors = new(StringComparer.Ordinal);

    private sealed record Visitor(long VisitedMs, long TriedMs);

    private sealed record Tracked(long NextReadMs, long LastSeenMs, TGroup? Group, long NewestBattleMs = 0, long WaitMs = 0);

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

    public bool IsDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.TryGetValue(tag, out var tracked) || IsDue(tracked, nowMs);
        }
    }

    public IReadOnlyList<string> DueTags(long nowMs)
    {
        lock (_lock)
        {
            return _players
                .Where(p => IsDue(p.Value, nowMs))
                .OrderBy(p => p.Value.NextReadMs)
                .Select(p => p.Key)
                .ToList();
        }
    }

    private bool IsDue(Tracked tracked, long nowMs) => tracked.NextReadMs <= nowMs + _opt.PollIntervalMs / 2;

    /// <summary>Not tracked, and didn't leave the groups lately: older battles in other logs still show them inside.</summary>
    public bool CanTrack(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.ContainsKey(tag)
                && (!_leftMs.TryGetValue(tag, out var leftMs) || leftMs < nowMs - _opt.ForgetAfterMs);
        }
    }

    /// <summary>
    /// The next read waits <see cref="PlayerPollOptions.RereadSpanShare"/> of the time the log took to fill, so it comes
    /// before the oldest battle drops out; a log unchanged since the last read waits twice as long as before.
    /// </summary>
    public void RecordRead(string tag, IReadOnlyList<CrBattle> log, TGroup? group, long seenMs, long nowMs)
    {
        var maxWait = Math.Max(_opt.PollIntervalMs, _opt.MaxRereadIntervalMs);
        var spanWait = Math.Clamp((long)(LogSpanMs(log) * _opt.RereadSpanShare), _opt.PollIntervalMs, maxWait);
        var newestBattleMs = log.Select(b => BattleRepository.ParseBattleTime(b.BattleTime)).DefaultIfEmpty(0).Max();
        lock (_lock)
        {
            var known = _players.GetValueOrDefault(tag);
            var isUnchanged = known is { WaitMs: > 0 } && known.NewestBattleMs == newestBattleMs;
            var wait = isUnchanged ? Math.Clamp(Math.Max(spanWait, known!.WaitMs * 2), _opt.PollIntervalMs, maxWait) : spanWait;
            var lastSeenMs = Math.Max(seenMs, known?.LastSeenMs ?? 0);
            _players[tag] = new Tracked(nowMs + wait, lastSeenMs, group ?? known?.Group, newestBattleMs, wait);
            if (group is not null)
            {
                _waitingVisitors.Remove(tag);
            }
        }
    }

    public void Forget(string tag, long nowMs)
    {
        lock (_lock)
        {
            _players.Remove(tag);
            _waitingVisitors.Remove(tag);
            _leftMs[tag] = nowMs;
        }
    }

    public int PlayersIn(TGroup group)
    {
        lock (_lock)
        {
            return _players.Values.Count(p => SameGroup(p.Group, group));
        }
    }

    public int RoomIn(TGroup group) => Math.Max(0, _opt.MaxPlayersPerGroup - PlayersIn(group));

    public IReadOnlyDictionary<TGroup, int> PlayersPerGroup()
    {
        lock (_lock)
        {
            return _players.Values
                .Where(p => p.Group is not null)
                .GroupBy(p => p.Group!.Value)
                .ToDictionary(g => g.Key, g => g.Count());
        }
    }

    public TGroup? GroupOf(string tag)
    {
        lock (_lock)
        {
            return _players.GetValueOrDefault(tag)?.Group;
        }
    }

    public void Restore(IEnumerable<(string Tag, TGroup Group, long SeenMs)> latest, long nowMs)
    {
        lock (_lock)
        {
            foreach (var (tag, group, seenMs) in latest)
            {
                _players.TryAdd(tag, new Tracked(nowMs, seenMs, group));
            }
        }
        ForgetInactive([], nowMs);
        Trim([]);
    }

    public IReadOnlyList<TrackedPlayer<TGroup>> Snapshot()
    {
        lock (_lock)
        {
            return _players
                .Where(p => p.Value.Group is not null)
                .Select(p => new TrackedPlayer<TGroup>(
                    p.Key, p.Value.Group!.Value, p.Value.NextReadMs, p.Value.LastSeenMs, p.Value.NewestBattleMs, p.Value.WaitMs))
                .ToList();
        }
    }

    public void Load(IEnumerable<TrackedPlayer<TGroup>> players, long nowMs)
    {
        lock (_lock)
        {
            foreach (var p in players)
            {
                _players.TryAdd(p.Tag, new Tracked(p.NextReadMs, p.LastSeenMs, p.Group, p.NewestBattleMs, p.WaitMs));
            }
        }
        ForgetInactive([], nowMs);
        Trim([]);
    }

    public void AddVisitor(string tag, long nowMs)
    {
        lock (_lock)
        {
            if (_waitingVisitors.ContainsKey(tag) || _players.GetValueOrDefault(tag)?.Group is not null)
            {
                return;
            }
            if (_waitingVisitors.Count >= MaxWaitingVisitors)
            {
                _waitingVisitors.Remove(_waitingVisitors.MinBy(v => v.Value.VisitedMs).Key);
            }
            _waitingVisitors[tag] = new Visitor(nowMs, 0);
        }
    }

    /// <summary>People look themselves up before they play, so a visitor is tried again until a battle shows their group.</summary>
    public IReadOnlyList<string> TakeVisitors(long nowMs, int max)
    {
        lock (_lock)
        {
            DropLapsedVisitors(nowMs);
            var taken = _waitingVisitors
                .Where(v => v.Value.TriedMs <= nowMs - _opt.VisitorRereadMs + _opt.PollIntervalMs / 2)
                .OrderBy(v => v.Value.TriedMs)
                .Take(max)
                .Select(v => v.Key)
                .ToList();
            foreach (var tag in taken)
            {
                _waitingVisitors[tag] = _waitingVisitors[tag] with { TriedMs = nowMs };
            }
            return taken;
        }
    }

    public bool IsClanDue(string clanTag, long nowMs)
    {
        lock (_lock)
        {
            return !_clansTriedMs.TryGetValue(clanTag, out var triedMs)
                || triedMs <= nowMs - _opt.ActiveSeedRetryMs + _opt.PollIntervalMs / 2;
        }
    }

    public void RecordClanTried(string clanTag, long nowMs)
    {
        lock (_lock)
        {
            _clansTriedMs[clanTag] = nowMs;
        }
    }

    public bool IsSeedDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.ContainsKey(tag)
                && (!_seedsDueMs.TryGetValue(tag, out var dueMs) || dueMs <= nowMs + _opt.PollIntervalMs / 2);
        }
    }

    public void RecordSeedTried(string tag, long newestBattleMs, long nowMs)
    {
        var isActive = newestBattleMs >= nowMs - _opt.ActiveSeedWindowMs;
        lock (_lock)
        {
            _seedsFailedMs.Remove(tag);
            _seedsDueMs[tag] = nowMs + (isActive ? _opt.ActiveSeedRetryMs : _opt.SeedRetryMs);
        }
    }

    /// <summary>Most failures are one-offs; a second in a row, as a deleted or banned account gives, makes the seed wait.</summary>
    public void RecordSeedFailed(string tag, long nowMs)
    {
        lock (_lock)
        {
            if (_seedsFailedMs.Remove(tag))
            {
                _seedsDueMs[tag] = nowMs + _opt.ActiveSeedRetryMs;
                return;
            }
            _seedsFailedMs[tag] = nowMs;
        }
    }

    /// <summary>Drops the players without a group and those over their group's share, the longest idle first.</summary>
    public void Trim(IReadOnlyCollection<string> pinned)
    {
        var pinnedTags = pinned.ToHashSet(StringComparer.Ordinal);
        lock (_lock)
        {
            var removable = _players.Where(p => !pinnedTags.Contains(p.Key)).ToList();
            foreach (var (tag, _) in removable.Where(p => p.Value.Group is null))
            {
                _players.Remove(tag);
            }
            foreach (var inGroup in removable.Where(p => p.Value.Group is not null).GroupBy(p => p.Value.Group))
            {
                var over = _players.Values.Count(p => SameGroup(p.Group, inGroup.Key)) - _opt.MaxPlayersPerGroup;
                foreach (var (tag, _) in inGroup.OrderBy(p => p.Value.LastSeenMs).Take(Math.Max(0, over)))
                {
                    _players.Remove(tag);
                }
            }
        }
    }

    public void ForgetInactive(IReadOnlyCollection<string> pinned, long nowMs)
    {
        var pinnedTags = pinned.ToHashSet(StringComparer.Ordinal);
        var activeSince = nowMs - _opt.ForgetAfterMs;
        lock (_lock)
        {
            var inactive = _players
                .Where(p => !pinnedTags.Contains(p.Key) && p.Value.LastSeenMs < activeSince)
                .Select(p => p.Key)
                .ToList();
            foreach (var tag in inactive)
            {
                _players.Remove(tag);
            }
            DropLapsedVisitors(nowMs);
            RemoveWhere(_seedsDueMs, dueMs => dueMs <= nowMs);
            RemoveWhere(_seedsFailedMs, failedMs => failedMs <= nowMs - _opt.ActiveSeedRetryMs);
            RemoveWhere(_clansTriedMs, triedMs => triedMs <= nowMs - _opt.ActiveSeedRetryMs);
            RemoveWhere(_leftMs, leftMs => leftMs < nowMs - _opt.ForgetAfterMs);
        }
    }

    // Callers hold the lock.
    private void DropLapsedVisitors(long nowMs)
    {
        var lapsed = _waitingVisitors
            .Where(v => v.Value.VisitedMs < nowMs - _opt.VisitorWaitMs || _players.GetValueOrDefault(v.Key)?.Group is not null)
            .Select(v => v.Key)
            .ToList();
        foreach (var tag in lapsed)
        {
            _waitingVisitors.Remove(tag);
        }
    }

    private static bool SameGroup(TGroup? a, TGroup? b) => EqualityComparer<TGroup?>.Default.Equals(a, b);

    private static void RemoveWhere(Dictionary<string, long> times, Func<long, bool> isDone)
    {
        foreach (var key in times.Where(t => isDone(t.Value)).Select(t => t.Key).ToList())
        {
            times.Remove(key);
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
