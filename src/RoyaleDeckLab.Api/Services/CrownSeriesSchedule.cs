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
    private readonly Dictionary<string, long> _seedsTriedMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _clansTriedMs = new(StringComparer.Ordinal);

    // Kept in memory only and never stored: the tags of people who used the Crown Series page, with when they last did.
    private readonly Dictionary<string, long> _waitingVisitors = new(StringComparer.Ordinal);

    /// <param name="Cap">The cap of the player's latest Duel; null until one is seen.</param>
    private sealed record Tracked(long NextReadMs, long LastDuelMs, int? Cap);

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
            var lastDuelMs = Math.Max(latestDuelMs, known?.LastDuelMs ?? 0);
            _players[tag] = new Tracked(nowMs + wait, lastDuelMs, latestCap ?? known?.Cap);
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

    /// <summary>Someone used the Crown Series page: their own log shows their league, and their opponents fill it.</summary>
    public void AddVisitor(string tag, long nowMs)
    {
        lock (_lock)
        {
            if (_waitingVisitors.Count < MaxWaitingVisitors || _waitingVisitors.ContainsKey(tag))
            {
                _waitingVisitors[tag] = nowMs;
            }
        }
    }

    /// <summary>
    /// The visitors whose Duels haven't been seen yet. People pick their decks before they play, so a visitor stays
    /// waiting, and is read every poll, until a Duel shows their league or
    /// <see cref="CrownSeriesOptions.VisitorWaitMs"/> passes.
    /// </summary>
    public IReadOnlyList<string> WaitingVisitors(long nowMs)
    {
        lock (_lock)
        {
            var done = _waitingVisitors
                .Where(v => v.Value < nowMs - _opt.VisitorWaitMs || _players.GetValueOrDefault(v.Key)?.Cap is not null)
                .Select(v => v.Key)
                .ToList();
            foreach (var tag in done)
            {
                _waitingVisitors.Remove(tag);
            }
            return _waitingVisitors.Keys.ToList();
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

    public bool IsClanDue(string clanTag, long nowMs)
    {
        lock (_lock)
        {
            return !_clansTriedMs.TryGetValue(clanTag, out var triedMs) || triedMs < nowMs - _opt.SeedRetryMs;
        }
    }

    public void RecordClanTried(string clanTag, long nowMs)
    {
        lock (_lock)
        {
            _clansTriedMs[clanTag] = nowMs;
        }
    }

    /// <summary>A seed not tracked yet, and not tried in the last <see cref="CrownSeriesOptions.SeedRetryMs"/>.</summary>
    public bool IsSeedDue(string tag, long nowMs)
    {
        lock (_lock)
        {
            return !_players.ContainsKey(tag)
                && (!_seedsTriedMs.TryGetValue(tag, out var triedMs) || triedMs < nowMs - _opt.SeedRetryMs);
        }
    }

    public void RecordSeedTried(string tag, long nowMs)
    {
        lock (_lock)
        {
            _seedsTriedMs[tag] = nowMs;
        }
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
