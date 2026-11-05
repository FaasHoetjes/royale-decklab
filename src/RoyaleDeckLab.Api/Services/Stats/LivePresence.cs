namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>
/// Who is looking at the site right now, from each open tab's live connection, kept in memory only. A visitor counts
/// while at least one of their tabs is in view, and the time it's in view adds up per visitor per day until
/// <see cref="StatsWriter"/> stores it.
/// </summary>
public sealed class LivePresence(TimeProvider clock)
{
    public const int MaxTabs = 5_000;
    public const int MaxTabsPerAddress = 20;

    /// <summary>A tab left in view on a second screen would otherwise count for hours.</summary>
    public static readonly TimeSpan MaxStretch = TimeSpan.FromMinutes(30);

    internal sealed class Visitor(string key)
    {
        public string Key { get; } = key;
        public int Tabs { get; set; }
        public int TabsInView { get; set; }
        public long InViewSinceMs { get; set; }
        public bool Ignored { get; set; }
    }

    public sealed class Tab
    {
        internal Tab(Visitor visitor, string address)
        {
            Owner = visitor;
            Address = address;
        }

        internal Visitor Owner { get; }
        internal string Address { get; }
        internal bool InView { get; set; }
        internal bool Left { get; set; }
    }

    private readonly object _lock = new();
    private readonly Dictionary<string, Visitor> _visitors = [];
    private readonly HashSet<string> _ignored = [];
    private readonly Dictionary<string, int> _tabsPerAddress = [];
    private readonly Dictionary<(DateOnly Day, string Visitor), long> _time = [];
    private int _tabs;
    private int _inView;

    /// <summary>Visitors with a tab in view right now.</summary>
    public int InView
    {
        get
        {
            lock (_lock)
            {
                return _inView;
            }
        }
    }

    /// <summary>Opens a tab for the visitor, or null when the site or their address already has as many as it allows.</summary>
    public Tab? Join(byte[] visitor, string address)
    {
        lock (_lock)
        {
            var fromAddress = _tabsPerAddress.GetValueOrDefault(address);
            if (_tabs >= MaxTabs || fromAddress >= MaxTabsPerAddress)
            {
                return null;
            }
            var key = Convert.ToHexString(visitor);
            if (!_visitors.TryGetValue(key, out var owner))
            {
                _visitors[key] = owner = new Visitor(key) { Ignored = _ignored.Contains(key) };
            }
            owner.Tabs++;
            _tabs++;
            _tabsPerAddress[address] = fromAddress + 1;
            return new Tab(owner, address);
        }
    }

    public void SetInView(Tab tab, bool inView)
    {
        lock (_lock)
        {
            if (!tab.Left)
            {
                SetInViewLocked(tab, inView);
            }
        }
    }

    public void Leave(Tab tab)
    {
        lock (_lock)
        {
            if (tab.Left)
            {
                return;
            }
            SetInViewLocked(tab, false);
            tab.Left = true;
            var owner = tab.Owner;
            owner.Tabs--;
            _tabs--;
            if (owner.Tabs == 0)
            {
                _visitors.Remove(owner.Key);
            }
            if (--_tabsPerAddress[tab.Address] == 0)
            {
                _tabsPerAddress.Remove(tab.Address);
            }
        }
    }

    /// <summary>The admin's own tabs, open now or opened later: they don't count, and their time isn't kept.</summary>
    public void Ignore(byte[] visitor)
    {
        lock (_lock)
        {
            var key = Convert.ToHexString(visitor);
            _ignored.Add(key);
            if (_visitors.TryGetValue(key, out var owner) && !owner.Ignored)
            {
                if (owner.TabsInView > 0)
                {
                    _inView--;
                }
                owner.Ignored = true;
            }
            foreach (var pending in _time.Keys.Where(k => k.Visitor == key).ToList())
            {
                _time.Remove(pending);
            }
        }
    }

    /// <summary>Ends every stretch in view as of now, so time up to a shutdown is stored before the tabs close.</summary>
    public void EndStretches()
    {
        lock (_lock)
        {
            var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
            foreach (var owner in _visitors.Values.Where(v => v.TabsInView > 0))
            {
                AddStretch(owner, now);
                owner.InViewSinceMs = now;
            }
        }
    }

    /// <summary>The time in view gathered since the last call.</summary>
    public IReadOnlyList<VisitTime> TakeTime()
    {
        lock (_lock)
        {
            var taken = _time.Select(t => new VisitTime(t.Key.Day, Convert.FromHexString(t.Key.Visitor), t.Value)).ToList();
            _time.Clear();
            return taken;
        }
    }

    private void SetInViewLocked(Tab tab, bool inView)
    {
        if (tab.InView == inView)
        {
            return;
        }
        tab.InView = inView;
        var owner = tab.Owner;
        var now = clock.GetUtcNow().ToUnixTimeMilliseconds();
        if (inView)
        {
            if (owner.TabsInView++ == 0)
            {
                owner.InViewSinceMs = now;
                if (!owner.Ignored)
                {
                    _inView++;
                }
            }
            return;
        }
        if (--owner.TabsInView == 0)
        {
            AddStretch(owner, now);
            if (!owner.Ignored)
            {
                _inView--;
            }
        }
    }

    private void AddStretch(Visitor owner, long now)
    {
        var ms = Math.Min(now - owner.InViewSinceMs, (long)MaxStretch.TotalMilliseconds);
        if (owner.Ignored || ms <= 0)
        {
            return;
        }
        var key = (StatsStore.DayOf(now), owner.Key);
        _time[key] = _time.GetValueOrDefault(key) + ms;
    }
}
