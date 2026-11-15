using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class MetaCache(
    IServiceScopeFactory scopeFactory,
    IOptions<MetaOptions> options,
    ILogger<MetaCache> logger)
{
    // A season brings its Hero on Monday, its balance update on Tuesday and an event Evo days later, all before the
    // Thursday war battles; a boundary for each would leave the last patch a day or two of training battles.
    // Four days keeps the releases of Oct-Nov 2026 apart: the 6th, 19th, 2nd and 9th, a week or more between them.
    public static readonly TimeSpan MinPatchLength = TimeSpan.FromDays(4);

    private readonly MetaOptions _opt = options.Value;
    private readonly object _buildLock = new();
    private readonly SemaphoreSlim _aggregateGate = new(1, 1);
    private readonly SemaphoreSlim _boundaryGate = new(1, 1);
    private readonly object _indexLock = new();

    private volatile List<DeckMeta> _meta = [];
    private volatile CardStatsResponse _cardStats = new(null, null, 0, false, []);
    private long _lastCacheTime;
    private long _epochStart;
    private long _version;
    private bool _isBuilding;
    private volatile bool _isLoaded;

    private Dictionary<string, DeckMeta> _metaIndex = new();
    private long _metaIndexVersion = -1;

    public IReadOnlyList<DeckMeta> Meta => _meta;
    public CardStatsResponse CardStats => _cardStats;
    public int DeckCount => _meta.Count;
    public long LastCacheTime => Interlocked.Read(ref _lastCacheTime);
    public long EpochStart => Interlocked.Read(ref _epochStart);

    public long Version => Interlocked.Read(ref _version);
    public bool IsBuilding
    {
        get
        {
            lock (_buildLock)
            {
                return _isBuilding;
            }
        }
    }

    /// <summary>
    /// False after a restart until the stored battles are aggregated. With no stored battles it stays false until the
    /// first crawl ends, however it ends, so a new install answers 503 on the meta endpoints for that crawl.
    /// </summary>
    public bool IsLoaded => _isLoaded;

    public static string DeckKey(IEnumerable<int> cardIds) => string.Join(',', cardIds.OrderBy(x => x));

    private long PruneCutoff()
        => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _opt.BattleWindowMs;

    public async Task InitializeAsync(CancellationToken ct = default)
    {
        try
        {
            long epoch;
            using (var scope = scopeFactory.CreateScope())
            {
                epoch = scope.ServiceProvider.GetRequiredService<BattleRepository>().GetEpochStart();
            }
            Interlocked.Exchange(ref _epochStart, epoch);
            if (epoch > 0)
            {
                logger.LogInformation("Patch boundary in effect: {Epoch}", IsoMs(epoch));
            }

            logger.LogInformation("Loading meta cache...");
            await LoadOrBuildAsync(ct);
        }
        finally
        {
            // Serve whatever meta exists, even when startup failed.
            _isLoaded = true;
        }
    }

    public async Task<List<DeckMeta>> AggregateFromStoreAsync(string reason, CancellationToken ct = default)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
        return await AggregateAsync(store, builder, reason, ct);
    }

    // Never prunes: without a fresh crawl, the stored battles, however old, are all there is to serve.
    // One at a time: a patch boundary set during a rebuild aggregates after it, so the newest boundary always wins.
    private async Task<List<DeckMeta>> AggregateAsync(BattleRepository store, MetaBuilder builder, string reason, CancellationToken ct)
    {
        await _aggregateGate.WaitAsync(ct);
        try
        {
            return await AggregateOneAsync(store, builder, reason, ct);
        }
        finally
        {
            _aggregateGate.Release();
        }
    }

    // Both boundaries come from one read of the store, which a watcher may have moved since memory was last set.
    private async Task<List<DeckMeta>> AggregateOneAsync(BattleRepository store, MetaBuilder builder, string reason, CancellationToken ct)
    {
        var (epoch, previous) = store.GetEpochs();
        Interlocked.Exchange(ref _epochStart, epoch);
        var tallier = epoch > 0
            ? new CardTallier([(previous, epoch), (epoch, long.MaxValue)])
            : new CardTallier([(0, long.MaxValue)]);
        var battles = 0;
        var decks = builder.AggregateBattles(
            Observe(store.AllBattles(), battle =>
            {
                battles++;
                tallier.Add(battle);
            }),
            epoch);
        var periods = tallier.Periods();
        _cardStats = epoch > 0
            ? CardPeriods.Compare(periods[1], await KeepPreviousPeriodAsync(store, periods[0], ct))
            : CardPeriods.Compare(periods[0], null);
        _meta = decks;
        _isLoaded = true;
        Interlocked.Increment(ref _version);
        Interlocked.Exchange(ref _lastCacheTime, store.GetLastBuild());
        logger.LogInformation("Meta {Reason}: {Decks} decks from {Battles} battles", reason, decks.Count, battles);
        return decks;
    }

    public async Task<MetaRebuild> RebuildAsync(string reason, CancellationToken ct = default)
    {
        lock (_buildLock)
        {
            if (_isBuilding)
            {
                logger.LogInformation("Meta rebuild ({Reason}) skipped: a build is already running", reason);
                return new MetaRebuild(MetaRebuildOutcome.Busy, _meta);
            }
            _isBuilding = true;
        }

        try
        {
            logger.LogInformation("Rebuilding meta cache ({Reason})...", reason);
            using var scope = scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
            var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();

            var crawl = await builder.CrawlTopWarClansAsync(ct);
            var fresh = crawl.WarBattles;

            if (fresh.Count == 0)
            {
                logger.LogWarning("Meta rebuild ({Reason}): fetched 0 battles, keeping existing cache", reason);
                return new MetaRebuild(MetaRebuildOutcome.NothingFetched, _meta);
            }

            var added = await store.MergeBattlesAsync(fresh, ct);
            await MergeCrownSeriesRoundsAsync(scope.ServiceProvider, crawl.CrownSeriesRounds, ct);
            await store.SetLastBuildAsync(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ct);
            // Old battles go only now that fresh ones have landed, so a failed crawl never empties the store.
            var cutoff = PruneCutoff();
            var pruned = await store.PruneAsync(cutoff, ct);
            await StartPatchOnNewCardVersionsAsync(scope.ServiceProvider, store, fresh, ct);
            var decks = await AggregateAsync(store, builder, $"rebuild ({reason})", ct);
            logger.LogInformation("  +{Added} new this fetch, {Fetched} fetched, {Pruned} pruned before {Cutoff}, {Kept} kept",
                added, fresh.Count, pruned, IsoMs(cutoff), store.Count());
            return new MetaRebuild(MetaRebuildOutcome.Rebuilt, decks);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            logger.LogInformation("Meta rebuild ({Reason}) cancelled, keeping existing cache", reason);
            return new MetaRebuild(MetaRebuildOutcome.Cancelled, _meta);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Meta rebuild ({Reason}) failed, keeping existing cache", reason);
            return new MetaRebuild(MetaRebuildOutcome.Failed, _meta);
        }
        finally
        {
            lock (_buildLock)
            {
                _isBuilding = false;
            }
        }
    }

    // The war meta is what a rebuild is for; failing to store the Duels the crawl came across shouldn't undo it.
    private async Task MergeCrownSeriesRoundsAsync(IServiceProvider services, List<CrownSeriesRound> rounds, CancellationToken ct)
    {
        try
        {
            await services.GetRequiredService<CrownSeriesRepository>().MergeRoundsAsync(rounds, ct);
        }
        catch (SqliteException ex)
        {
            logger.LogError(ex, "Couldn't store the {Count} Crown Series rounds found by the war crawl", rounds.Count);
        }
    }

    private async Task LoadOrBuildAsync(CancellationToken ct)
    {
        long lastBuild, count;
        using (var scope = scopeFactory.CreateScope())
        {
            var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
            lastBuild = store.GetLastBuild();
            count = store.Count();
        }
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        if (lastBuild > 0 && now - lastBuild < _opt.CacheRefreshIntervalMs && count > 0)
        {
            logger.LogInformation("Meta cache fresh; aggregating from stored battles");
            await AggregateFromStoreAsync("startup (cached)", ct);
            return;
        }

        if (count > 0)
        {
            logger.LogInformation("Meta cache stale; serving stored battles while a fresh crawl runs...");
            await AggregateFromStoreAsync("startup (stale)", ct);
        }
        else
        {
            logger.LogInformation("Meta store empty, building from scratch...");
        }

        var rebuild = await RebuildAsync("startup", ct);
        if (rebuild is { Outcome: not (MetaRebuildOutcome.Busy or MetaRebuildOutcome.Cancelled), Decks.Count: 0 })
        {
            logger.LogError("Could not build meta from the API. Player searches still work; " +
                "decks won't have meta scores until data lands. Check CLASH_ROYALE_API_KEY is bound to this server's IP.");
        }
    }

    /// <summary>Moves the patch boundary to any time, unlike <see cref="StartPatchAsync"/>.</summary>
    public async Task<List<DeckMeta>> SetEpochAsync(long ms, CancellationToken ct = default)
    {
        using (var scope = scopeFactory.CreateScope())
        {
            var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
            await _boundaryGate.WaitAsync(ct);
            try
            {
                await SaveEpochAsync(store, ms, ct);
            }
            finally
            {
                _boundaryGate.Release();
            }
        }
        // The boundary is saved by now, so a caller who gives up waiting mustn't leave it unapplied until the next rebuild.
        return await AggregateFromStoreAsync("epoch update", CancellationToken.None);
    }

    /// <summary>
    /// Starts a new patch at <paramref name="ms"/>, unless the current one started after it or less than
    /// <see cref="MinPatchLength"/> before it. Returns whether the boundary moved.
    /// </summary>
    public async Task<bool> StartPatchAsync(long ms, string reason, CancellationToken ct = default)
    {
        if (!await TryStartPatchAsync(ms, reason, ct))
        {
            return false;
        }
        await AggregateFromStoreAsync("patch boundary", CancellationToken.None);
        return true;
    }

    // Reads the boundary from the store: a watcher can tick before InitializeAsync has loaded it into memory.
    private async Task<bool> TryStartPatchAsync(long ms, string reason, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        await _boundaryGate.WaitAsync(ct);
        try
        {
            var epoch = store.GetEpochStart();
            if (ms < epoch + (long)MinPatchLength.TotalMilliseconds)
            {
                logger.LogInformation("{Reason} at {At}: within {Days} days of the patch boundary {Epoch} or before it; boundary kept",
                    reason, IsoMs(ms), MinPatchLength.TotalDays, IsoMs(epoch));
                return false;
            }
            await SaveEpochAsync(store, ms, ct);
            logger.LogInformation("{Reason}: patch boundary set to {Epoch}", reason, IsoMs(ms));
            return true;
        }
        finally
        {
            _boundaryGate.Release();
        }
    }

    private async Task SaveEpochAsync(BattleRepository store, long ms, CancellationToken ct)
    {
        await store.SetEpochStartAsync(ms, ct);
        Interlocked.Exchange(ref _epochStart, ms);
    }

    // Saved after the boundary: a restart in between finds the same release again, and the boundary it saved keeps
    // the second sighting from moving it.
    private async Task StartPatchOnNewCardVersionsAsync(
        IServiceProvider services, BattleRepository store, IReadOnlyList<BattleRecord> fresh, CancellationToken ct)
    {
        var releases = services.GetRequiredService<CardReleases>();
        CardRelease? release;
        try
        {
            release = await releases.FindNewAsync(store, fresh, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Card release check failed; the meta is rebuilt without it");
            return;
        }
        if (release is null)
        {
            return;
        }
        var names = string.Join(", ", release.Versions.Select(v => $"{v.CardId} {v.Version}"));
        await TryStartPatchAsync(release.FirstSeenMs, $"New card version first played ({names})", ct);
        await store.AddKnownCardVersionsAsync(release.Versions, ct);
    }

    // The last patch's battles age out of the 30-day window, so its tally is saved and outlives them. A new tally
    // replaces it only when it covers more battles, as the first crawls after a season starts still bring in older ones.
    private static async Task<CardPeriod?> KeepPreviousPeriodAsync(BattleRepository store, CardPeriod fromStore, CancellationToken ct)
    {
        var saved = store.GetCardPeriod(fromStore.EndMs);
        if (fromStore.Battles > (saved?.Battles ?? 0))
        {
            await store.SaveCardPeriodAsync(fromStore, ct);
            return fromStore;
        }
        return saved;
    }

    private static IEnumerable<T> Observe<T>(IEnumerable<T> source, Action<T> observer)
    {
        foreach (var item in source)
        {
            observer(item);
            yield return item;
        }
    }

    public int BattleCount()
    {
        using var scope = scopeFactory.CreateScope();
        return scope.ServiceProvider.GetRequiredService<BattleRepository>().Count();
    }

    public Dictionary<string, DeckMeta> GetMetaIndex()
    {
        var version = Version;
        lock (_indexLock)
        {
            if (_metaIndexVersion != version)
            {
                var index = new Dictionary<string, DeckMeta>();
                foreach (var deck in _meta)
                {
                    index[DeckKey(deck.CardIds)] = deck;
                }
                _metaIndex = index;
                _metaIndexVersion = version;
            }
            return _metaIndex;
        }
    }

    public static string IsoMs(long ms)
        => DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
}
