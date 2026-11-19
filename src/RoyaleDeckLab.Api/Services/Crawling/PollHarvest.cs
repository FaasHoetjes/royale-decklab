using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Crawling;

/// <summary>What one poll read, shared by the reads running in parallel.</summary>
public abstract class PollHarvest<TGroup> where TGroup : struct
{
    protected object Lock { get; } = new();

    private readonly HashSet<string> _read = new(StringComparer.Ordinal);
    private readonly Dictionary<string, long> _newestBattleMs = new(StringComparer.Ordinal);
    private readonly Dictionary<string, TGroup> _opponents = new(StringComparer.Ordinal);
    private readonly Dictionary<string, TGroup> _leads = new(StringComparer.Ordinal);
    private readonly Dictionary<string, TGroup> _leadClans = new(StringComparer.Ordinal);
    private readonly HashSet<string> _failureKinds = new(StringComparer.Ordinal);
    private int _failedReads;
    private List<LadderBattle> _pendingLadder = [];
    private int _ladderFound;

    public int LadderAdded { get; set; }

    public int LadderFound
    {
        get
        {
            lock (Lock)
            {
                return _ladderFound;
            }
        }
    }

    public int PlayersRead
    {
        get
        {
            lock (Lock)
            {
                return _read.Count;
            }
        }
    }

    public int FailedReads => Volatile.Read(ref _failedReads);

    public IReadOnlyCollection<string> FailureKinds
    {
        get
        {
            lock (Lock)
            {
                return _failureKinds.ToList();
            }
        }
    }

    public void MarkRead(string tag)
    {
        lock (Lock)
        {
            _read.Add(tag);
        }
    }

    public bool WasRead(string tag)
    {
        lock (Lock)
        {
            return _read.Contains(tag);
        }
    }

    public void AddFailedRead(string kind)
    {
        Interlocked.Increment(ref _failedReads);
        lock (Lock)
        {
            _failureKinds.Add(kind);
        }
    }

    /// <summary>The newest battle in the player's log, of any mode; null when their log wasn't read this poll.</summary>
    public long? NewestBattleMs(string tag)
    {
        lock (Lock)
        {
            return _newestBattleMs.TryGetValue(tag, out var ms) ? ms : null;
        }
    }

    /// <returns>The log owner's group and when they last played in it, for <see cref="PlayerTracker{TGroup}.RecordRead"/>.</returns>
    public (TGroup? Group, long SeenMs) Add(string tag, IReadOnlyList<CrBattle> log)
    {
        lock (Lock)
        {
            _newestBattleMs[tag] = log.Select(b => BattleRepository.ParseBattleTime(b.BattleTime)).DefaultIfEmpty(0).Max();
            var ladderSides = log.SelectMany(LadderBattles.From).ToList();
            _pendingLadder.AddRange(ladderSides);
            _ladderFound += ladderSides.Count;
            return AddLog(tag, log, ladderSides);
        }
    }

    /// <summary>Called holding <see cref="Lock"/>.</summary>
    protected abstract (TGroup? Group, long SeenMs) AddLog(
        string tag, IReadOnlyList<CrBattle> log, IReadOnlyList<LadderBattle> ladderSides);

    public List<LadderBattle> TakePendingLadder()
    {
        lock (Lock)
        {
            var pending = _pendingLadder;
            _pendingLadder = [];
            return pending;
        }
    }

    public IReadOnlyList<(string Tag, TGroup Group)> Opponents() => Unread(_opponents);

    /// <summary>Players met outside the poll's own mode: likely near the group they were met from.</summary>
    public IReadOnlyList<(string Tag, TGroup Group)> Leads() => Unread(_leads);

    public IReadOnlyList<(string Tag, TGroup Group)> LeadClans()
    {
        lock (Lock)
        {
            return _leadClans.Select(c => (c.Key, c.Value)).ToList();
        }
    }

    protected void AddOpponent(string tag, TGroup group) => _opponents[tag] = group;

    protected void AddLead(string tag, TGroup group) => _leads.TryAdd(tag, group);

    protected void AddLeadClan(IReadOnlyList<CrBattle> log, TGroup group)
    {
        var clanTag = log
            .Select(b => b.Team?.FirstOrDefault()?.Clan?.Tag)
            .FirstOrDefault(tag => !string.IsNullOrEmpty(tag));
        if (clanTag is not null)
        {
            _leadClans.TryAdd(clanTag, group);
        }
    }

    private IReadOnlyList<(string Tag, TGroup Group)> Unread(Dictionary<string, TGroup> players)
    {
        lock (Lock)
        {
            return players
                .Where(p => !_read.Contains(p.Key))
                .Select(p => (p.Key, p.Value))
                .ToList();
        }
    }
}
