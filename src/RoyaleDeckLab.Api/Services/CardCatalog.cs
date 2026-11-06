using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

public sealed class CardCatalog(IServiceScopeFactory scopeFactory, TimeProvider clock)
{
    // Cards change rarely (balance updates, occasional new card), but when a new
    // card ships its icon URL can lag, so refresh periodically instead of caching
    // for the life of the process.
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(6);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(30);

    private readonly object _gate = new();
    private IReadOnlyList<CatalogCard>? _cards;
    private DateTimeOffset _refreshAfter;
    private Lazy<Task<IReadOnlyList<CatalogCard>>>? _refresh;

    public async Task<IReadOnlyList<CatalogCard>> GetAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Lazy<Task<IReadOnlyList<CatalogCard>>> refresh;
        IReadOnlyList<CatalogCard>? stale;
        lock (_gate)
        {
            var now = clock.GetUtcNow();
            if (_cards is not null && now < _refreshAfter)
            {
                return _cards;
            }
            if (_refresh is null || (now >= _refreshAfter && _refresh.IsValueCreated && _refresh.Value.IsCompleted))
            {
                _refresh = new Lazy<Task<IReadOnlyList<CatalogCard>>>(RefreshAsync);
            }
            refresh = _refresh;
            stale = _cards;
        }

        // Existing data stays available during refresh. Only a cold start waits, and cancelling one caller
        // must not cancel the refresh shared by the other callers.
        var pending = refresh.Value;
        return stale ?? await pending.WaitAsync(ct);
    }

    private async Task<IReadOnlyList<CatalogCard>> RefreshAsync()
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleClient>();
            var fetched = await client.GetAllCardsAsync(CancellationToken.None);
            lock (_gate)
            {
                if (fetched.Count > 0)
                {
                    _cards = fetched;
                }
                _refreshAfter = clock.GetUtcNow() + (fetched.Count > 0 ? Ttl : RetryDelay);
                return _cards ?? [];
            }
        }
        catch
        {
            lock (_gate)
            {
                // Also keep a failed cold-start task for the backoff period so new requests don't
                // repeatedly hit an unavailable API. A refresh with stale data completes successfully.
                _refreshAfter = clock.GetUtcNow() + RetryDelay;
                if (_cards is not null)
                {
                    return _cards;
                }
            }
            throw;
        }
    }
}
