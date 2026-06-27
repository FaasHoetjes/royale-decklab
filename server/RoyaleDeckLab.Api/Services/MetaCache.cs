using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Holds the aggregated meta in memory and owns the build/refresh lifecycle —
/// the port of the module-level state and functions that were inline at the top
/// of <c>server.ts</c> (metaCache, lastCacheTime, isBuilding, metaEpochStart,
/// aggregateFromStore, rebuildMetaCache, loadOrBuildMetaCache).
///
/// Registered as a singleton. Unlike Bun's single-threaded event loop, ASP.NET
/// serves requests on many threads while the background service refreshes, so:
/// the deck list is swapped by atomic reference assignment (readers see either
/// the whole old list or the whole new one), and the "a build is in flight" guard
/// is a lock. Scoped DB work (BattleRepository/MetaBuilder) is resolved per operation
/// through the scope factory, since a singleton can't hold a scoped DbContext.
/// </summary>
public sealed class MetaCache(
    IServiceScopeFactory scopeFactory,
    IOptions<MetaOptions> options,
    ILogger<MetaCache> logger)
{
    private readonly MetaOptions _opt = options.Value;
    private readonly object _buildLock = new();
    private readonly object _indexLock = new();

    private volatile List<DeckMeta> _meta = [];
    private long _lastCacheTime;
    private long _epochStart;
    private bool _isBuilding;

    // Exact-deck lookup index for scoring (slice 2): sorted-card-id key → meta
    // entry. Rebuilt lazily whenever the cache changes (keyed on _lastCacheTime).
    private Dictionary<string, DeckMeta> _metaIndex = new();
    private long _metaIndexTime = -1;

    public IReadOnlyList<DeckMeta> Meta => _meta;
    public int DeckCount => _meta.Count;
    public long LastCacheTime => Interlocked.Read(ref _lastCacheTime);
    public long EpochStart => Interlocked.Read(ref _epochStart);
    public bool IsBuilding { get { lock (_buildLock) { return _isBuilding; } } }

    /// <summary>The sorted-card-id key used to match a deck against the meta index.</summary>
    public static string DeckKey(IEnumerable<int> cardIds) => string.Join(',', cardIds.OrderBy(x => x));

    /// <summary>
    /// The oldest battleTime that still counts: the later of the rolling-window
    /// edge and the patch boundary.
    /// </summary>
    private long EffectiveCutoff()
        => Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _opt.BattleWindowMs, Interlocked.Read(ref _epochStart));

    /// <summary>Restores the patch boundary from the store and loads/builds the cache. Call once at startup.</summary>
    public async Task InitializeAsync(CancellationToken ct = default)
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

    /// <summary>
    /// Re-aggregates the in-memory cache from the stored battles after pruning past
    /// the effective cutoff. Pure DB + CPU, no network. Does NOT advance the stored
    /// last-build time (that marks the last successful fetch).
    /// </summary>
    public List<DeckMeta> AggregateFromStore(string reason)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
        return AggregateWithin(store, builder, reason);
    }

    private List<DeckMeta> AggregateWithin(BattleRepository store, MetaBuilder builder, string reason)
    {
        var cutoff = EffectiveCutoff();
        var pruned = store.Prune(cutoff);
        var battles = store.AllBattles();

        var decks = builder.AggregateBattles(battles);
        _meta = decks;
        Interlocked.Exchange(ref _lastCacheTime, store.GetLastBuild());
        logger.LogInformation("Meta {Reason}: {Decks} decks from {Battles} battles (pruned {Pruned}, cutoff {Cutoff})",
            reason, decks.Count, battles.Count, pruned, IsoMs(cutoff));
        return decks;
    }

    /// <summary>
    /// Rebuilds from a fresh fetch, then swaps the result into the cache. Returns
    /// the existing cache unchanged if a build is already running, the fetch comes
    /// back empty, or the build fails.
    /// </summary>
    public async Task<List<DeckMeta>> RebuildAsync(string reason, CancellationToken ct = default)
    {
        lock (_buildLock)
        {
            if (_isBuilding)
            {
                logger.LogInformation("Meta rebuild ({Reason}) skipped: a build is already running", reason);
                return _meta;
            }
            _isBuilding = true;
        }

        try
        {
            logger.LogInformation("Rebuilding meta cache ({Reason})...", reason);
            using var scope = scopeFactory.CreateScope();
            var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
            var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();

            var fresh = await builder.CollectWarBattleRecordsAsync(ct);

            // An empty fetch means the API is down. Keep the existing store and
            // cache rather than wiping good data with nothing.
            if (fresh.Count == 0)
            {
                logger.LogWarning("Meta rebuild ({Reason}): fetched 0 battles, keeping existing cache", reason);
                return _meta;
            }

            var added = store.MergeBattles(fresh);
            store.SetLastBuild(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            var decks = AggregateWithin(store, builder, $"rebuild ({reason})");
            logger.LogInformation("  +{Added} new this fetch, {Fetched} fetched, {Kept} kept after cutoff",
                added, fresh.Count, store.Count());
            return decks;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Meta rebuild ({Reason}) failed, keeping existing cache", reason);
            return _meta;
        }
        finally
        {
            lock (_buildLock) { _isBuilding = false; }
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

        // Fresh enough and we have battles — aggregate without hitting the API.
        if (lastBuild > 0 && now - lastBuild < _opt.CacheRefreshIntervalMs && count > 0)
        {
            logger.LogInformation("Meta cache fresh; aggregating from stored battles");
            AggregateFromStore("startup (cached)");
            return;
        }

        logger.LogInformation("Meta cache stale or missing, rebuilding...");
        var decks = await RebuildAsync("startup", ct);
        if (decks.Count == 0 && count > 0)
        {
            logger.LogWarning("Rebuild fetched nothing (API down?); aggregating from stored battles instead.");
            AggregateFromStore("startup (fallback)");
            return;
        }
        if (decks.Count == 0)
        {
            logger.LogError("Could not build meta from the API. Player searches still work; " +
                "decks won't have meta scores until data lands. Check CLASH_ROYALE_API_KEY is bound to this server's IP.");
        }
    }

    /// <summary>Sets the patch boundary, drops pre-boundary battles, and re-aggregates immediately (no re-fetch).</summary>
    public List<DeckMeta> SetEpoch(long ms)
    {
        Interlocked.Exchange(ref _epochStart, ms);
        using (var scope = scopeFactory.CreateScope())
        {
            scope.ServiceProvider.GetRequiredService<BattleRepository>().SetEpochStart(ms);
        }
        return AggregateFromStore("epoch update");
    }

    public int BattleCount()
    {
        using var scope = scopeFactory.CreateScope();
        return scope.ServiceProvider.GetRequiredService<BattleRepository>().Count();
    }

    /// <summary>Exact-deck lookup index, rebuilt lazily when the cache changes. Used by deck scoring.</summary>
    public Dictionary<string, DeckMeta> GetMetaIndex()
    {
        var cacheTime = Interlocked.Read(ref _lastCacheTime);
        lock (_indexLock)
        {
            if (_metaIndexTime != cacheTime)
            {
                var index = new Dictionary<string, DeckMeta>();
                foreach (var deck in _meta)
                {
                    index[DeckKey(deck.CardIds)] = deck;
                }
                _metaIndex = index;
                _metaIndexTime = cacheTime;
            }
            return _metaIndex;
        }
    }

    /// <summary>Formats epoch ms as an ISO-8601 UTC string with millisecond precision (matches the old JS output).</summary>
    public static string IsoMs(long ms)
        => DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
}
