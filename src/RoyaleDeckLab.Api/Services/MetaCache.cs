using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

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
    private long _version;
    private bool _isBuilding;

    private Dictionary<string, DeckMeta> _metaIndex = new();
    private long _metaIndexVersion = -1;

    public IReadOnlyList<DeckMeta> Meta => _meta;
    public int DeckCount => _meta.Count;
    public long LastCacheTime => Interlocked.Read(ref _lastCacheTime);
    public long EpochStart => Interlocked.Read(ref _epochStart);

    public long Version => Interlocked.Read(ref _version);
    public bool IsBuilding { get { lock (_buildLock) { return _isBuilding; } } }

    public static string DeckKey(IEnumerable<int> cardIds) => string.Join(',', cardIds.OrderBy(x => x));

    private long PruneCutoff()
        => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - _opt.BattleWindowMs;

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

    public async Task<List<DeckMeta>> AggregateFromStoreAsync(string reason, CancellationToken ct = default)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        var builder = scope.ServiceProvider.GetRequiredService<MetaBuilder>();
        return await AggregateWithinAsync(store, builder, reason, ct);
    }

    private async Task<List<DeckMeta>> AggregateWithinAsync(
        BattleRepository store, MetaBuilder builder, string reason, CancellationToken ct)
    {
        var cutoff = PruneCutoff();
        var pruned = await store.PruneAsync(cutoff, ct);
        var decks = builder.AggregateBattles(store.AllBattles(), Interlocked.Read(ref _epochStart));
        _meta = decks;
        Interlocked.Increment(ref _version);
        Interlocked.Exchange(ref _lastCacheTime, store.GetLastBuild());
        logger.LogInformation("Meta {Reason}: {Decks} decks from {Battles} battles (pruned {Pruned}, cutoff {Cutoff})",
            reason, decks.Count, store.Count(), pruned, IsoMs(cutoff));
        return decks;
    }

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

            if (fresh.Count == 0)
            {
                logger.LogWarning("Meta rebuild ({Reason}): fetched 0 battles, keeping existing cache", reason);
                return _meta;
            }

            var added = await store.MergeBattlesAsync(fresh, ct);
            await store.SetLastBuildAsync(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), ct);
            var decks = await AggregateWithinAsync(store, builder, $"rebuild ({reason})", ct);
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

        var decks = await RebuildAsync("startup", ct);
        if (decks.Count == 0)
        {
            logger.LogError("Could not build meta from the API. Player searches still work; " +
                "decks won't have meta scores until data lands. Check CLASH_ROYALE_API_KEY is bound to this server's IP.");
        }
    }

    public async Task<List<DeckMeta>> SetEpochAsync(long ms, CancellationToken ct = default)
    {
        Interlocked.Exchange(ref _epochStart, ms);
        using (var scope = scopeFactory.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<BattleRepository>().SetEpochStartAsync(ms, ct);
        }
        return await AggregateFromStoreAsync("epoch update", ct);
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
