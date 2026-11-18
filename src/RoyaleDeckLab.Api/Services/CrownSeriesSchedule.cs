using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Which players the Crown Series poll tracks, and when each one's battle log is next worth reading: after half the
/// time the log took to fill, so it's read again long before its oldest Duel drops out. Each player counts toward the
/// cap of their latest Duel, so every league gets its share of the reads.
/// </summary>
public sealed class CrownSeriesSchedule(IOptions<CrownSeriesOptions> options)
{
    // Bounds the visitors waiting for the next Duel weekend, whatever the traffic.
    private const int MaxWaitingVisitors = 10_000;

    private readonly CrownSeriesOptions _opt = options.Value;
    private readonly object _lock = new();
    private readonly Dictionary<string, Tracked> _players = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _seedsDueMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _seedsFailedMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _clansTriedMs = new(StringComparer.Ordinal);
    private (long FetchedMs, IReadOnlyList<string> Tags)? _warPlayers;

    // Kept in memory only and never stored: the tags of people who looked themselves up on the site.
    private readonly Dictionary<string, Visitor> _waitingVisitors = new(StringComparer.Ordinal);

    private sealed record Visitor(long VisitedMs, long TriedMs);

    /// <param name="Cap">The cap of the player's latest Duel; null until one is seen.</param>
    /// <param name="NewestBattleMs">The newest battle of any mode in the log last read; 0 when unknown.</param>
    /// <param name="WaitMs">How long the poll waits after that read; 0 when unknown.</param>
    private sealed record Tracked(long NextReadMs, long LastDuelMs, int? Cap, long NewestBattleMs = 0, long WaitMs = 0);

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

    /// <summary>
    /// A log with no new battle since the last read waits twice as long as before: most players finish their run of
    /// Duels with a day or two of the weekend left, and their unchanged logs are wasted reads until they play again.
    /// </summary>
    public void RecordRead(string tag, IReadOnlyList<CrBattle> log, long nowMs)
    {
        var maxWait = Math.Max(_opt.PollIntervalMs, _opt.MaxRereadIntervalMs);
        var spanWait = Math.Clamp(LogSpanMs(log) / 2, _opt.PollIntervalMs, maxWait);
        var newestBattleMs = log.Select(b => BattleRepository.ParseBattleTime(b.BattleTime)).DefaultIfEmpty(0).Max();
        var duels = log
            .Where(CrownSeriesRounds.IsCrownSeries)
            .Select(b => (TimeMs: BattleRepository.ParseBattleTime(b.BattleTime), Battle: b))
            .ToList();
        var latestDuelMs = duels.Select(d => d.TimeMs).DefaultIfEmpty(0).Max();
        var latestCap = duels
            .OrderByDescending(d => d.TimeMs)
            .Select(d => CrownSeriesRounds.CapOf(CrownSeriesRounds.From(d.Battle)))
            .FirstOrDefault(cap => cap is not null);
        lock (_lock)
        {
            var known = _players.GetValueOrDefault(tag);
            var isUnchanged = known is { WaitMs: > 0 } && known.NewestBattleMs == newestBattleMs;
            var wait = isUnchanged ? Math.Clamp(Math.Max(spanWait, known!.WaitMs * 2), _opt.PollIntervalMs, maxWait) : spanWait;
            var lastDuelMs = Math.Max(latestDuelMs, known?.LastDuelMs ?? 0);
            _players[tag] = new Tracked(nowMs + wait, lastDuelMs, latestCap ?? known?.Cap, newestBattleMs, wait);
            if (latestCap is not null)
            {
                _waitingVisitors.Remove(tag);
            }
        }
    }

    public int PlayersAt(int cap)
    {
        lock (_lock)
        {
            return _players.Values.Count(p => p.Cap == cap);
        }
    }

    public int RoomAt(int cap) => Math.Max(0, _opt.MaxPlayersPerCap - PlayersAt(cap));

    public IReadOnlyDictionary<int, int> PlayersPerCap()
    {
        lock (_lock)
        {
            return _players.Values
                .Where(p => p.Cap is not null)
                .GroupBy(p => p.Cap ?? 0)
                .OrderBy(g => g.Key)
                .ToDictionary(g => g.Key, g => g.Count());
        }
    }

    /// <summary>
    /// Tracks the players of the stored Duels again after a restart, each at the cap of their latest Duel: a player's
    /// cap holds for the weekend, and the lower leagues' players would otherwise be found again only through seeds.
    /// They are all due, and the same rules as a poll drop the inactive ones and the ones over their cap's share.
    /// </summary>
    public void Restore(IReadOnlyList<CappedBattle> rounds, long nowMs)
    {
        var latest = rounds
            .GroupBy(r => r.Record.PlayerTag, StringComparer.Ordinal)
            .Select(g => g.MaxBy(r => r.Record.BattleTimeMs));
        lock (_lock)
        {
            foreach (var round in latest)
            {
                _players.TryAdd(round.Record.PlayerTag, new Tracked(nowMs, round.Record.BattleTimeMs, round.Cap));
            }
        }
        ForgetInactive([], nowMs);
        Trim([]);
    }

    /// <summary>
    /// Someone looked themselves up on the site: their own log shows their league, and their opponents fill it. A
    /// visitor waits from their first lookup, so a regular who never plays Duels drops out and is only added again by a
    /// later lookup. A full list makes room by dropping the visitor who has waited longest.
    /// </summary>
    public void AddVisitor(string tag, long nowMs)
    {
        lock (_lock)
        {
            if (_waitingVisitors.ContainsKey(tag) || _players.GetValueOrDefault(tag)?.Cap is not null)
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

    /// <summary>
    /// Up to <paramref name="max"/> visitors whose Duels haven't been seen yet, the longest untried first. People look
    /// themselves up before they play, so a visitor is tried again every <see cref="CrownSeriesOptions.VisitorRereadMs"/>
    /// until a Duel shows their league or <see cref="CrownSeriesOptions.VisitorWaitMs"/> passes since their visit.
    /// </summary>
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

    public int? CapOf(string tag)
    {
        lock (_lock)
        {
            return _players.GetValueOrDefault(tag)?.Cap;
        }
    }

    /// <summary>The caps below King's that still have room, counted once.</summary>
    public IReadOnlySet<int> LowerCapsWithRoom()
    {
        var perCap = PlayersPerCap();
        return CrownSeriesCaps.All
            .Where(cap => cap < LevelModel.MaxDisplayLevel)
            .Where(cap => perCap.GetValueOrDefault(cap) < _opt.MaxPlayersPerCap)
            .ToHashSet();
    }

    /// <summary>A clan is asked again within the weekend: its members who hadn't played yet may have since.</summary>
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

    /// <summary>A seed not tracked yet, and not tried recently: see <see cref="RecordSeedTried"/>.</summary>
    public bool IsSeedDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.ContainsKey(tag)
                && (!_seedsDueMs.TryGetValue(tag, out var dueMs) || dueMs <= nowMs + _opt.PollIntervalMs / 2);
        }
    }

    /// <summary>
    /// A seed whose log was read. Many players start their Duels well into the weekend, so one who battled lately is
    /// tried again after <see cref="CrownSeriesOptions.ActiveSeedRetryMs"/>, an idle one after
    /// <see cref="CrownSeriesOptions.SeedRetryMs"/>.
    /// </summary>
    public void RecordSeedTried(string tag, long newestBattleMs, long nowMs)
    {
        var isActive = newestBattleMs >= nowMs - _opt.ActiveSeedWindowMs;
        lock (_lock)
        {
            _seedsFailedMs.Remove(tag);
            _seedsDueMs[tag] = nowMs + (isActive ? _opt.ActiveSeedRetryMs : _opt.SeedRetryMs);
        }
    }

    /// <summary>
    /// A seed whose log the API failed to send is tried again next poll, since most failures are one-offs; failing
    /// again, as a deleted or banned account does every time, it waits <see cref="CrownSeriesOptions.ActiveSeedRetryMs"/>.
    /// </summary>
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

    /// <summary>The war crawl's players, loaded from the store at most every <see cref="CrownSeriesOptions.WarPlayersRefreshMs"/>.</summary>
    public IReadOnlyList<string> WarPlayers(Func<IReadOnlyList<string>> load, long nowMs)
    {
        lock (_lock)
        {
            if (_warPlayers is { } cached && cached.FetchedMs > nowMs - _opt.WarPlayersRefreshMs)
            {
                return cached.Tags;
            }
        }
        var tags = load();
        lock (_lock)
        {
            _warPlayers = (nowMs, tags);
        }
        return tags;
    }

    /// <summary>
    /// Drops the players read without a Duel, and the ones over their cap's share, the longest idle first. Ranked
    /// players stay: the poll reads them anyway.
    /// </summary>
    public void Trim(IReadOnlyCollection<string> ranked)
    {
        var rankedTags = ranked.ToHashSet(StringComparer.Ordinal);
        lock (_lock)
        {
            var removable = _players.Where(p => !rankedTags.Contains(p.Key)).ToList();
            foreach (var (tag, _) in removable.Where(p => p.Value.Cap is null))
            {
                _players.Remove(tag);
            }
            foreach (var atCap in removable.Where(p => p.Value.Cap is not null).GroupBy(p => p.Value.Cap))
            {
                var over = _players.Values.Count(p => p.Cap == atCap.Key) - _opt.MaxPlayersPerCap;
                foreach (var (tag, _) in atCap.OrderBy(p => p.Value.LastDuelMs).Take(Math.Max(0, over)))
                {
                    _players.Remove(tag);
                }
            }
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
            DropLapsedVisitors(nowMs);
            RemoveWhere(_seedsDueMs, dueMs => dueMs <= nowMs);
            RemoveWhere(_seedsFailedMs, failedMs => failedMs <= nowMs - _opt.ActiveSeedRetryMs);
            RemoveWhere(_clansTriedMs, triedMs => triedMs <= nowMs - _opt.ActiveSeedRetryMs);
        }
    }

    // Callers hold the lock.
    private void DropLapsedVisitors(long nowMs)
    {
        var lapsed = _waitingVisitors
            .Where(v => v.Value.VisitedMs < nowMs - _opt.VisitorWaitMs || _players.GetValueOrDefault(v.Key)?.Cap is not null)
            .Select(v => v.Key)
            .ToList();
        foreach (var tag in lapsed)
        {
            _waitingVisitors.Remove(tag);
        }
    }

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
