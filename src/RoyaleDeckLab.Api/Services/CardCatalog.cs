using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

public sealed class CardCatalog(IServiceScopeFactory scopeFactory)
{
    // Cards change rarely (balance updates, occasional new card), but when a new
    // card ships its icon URL can lag, so refresh periodically instead of caching
    // for the life of the process.
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(6);

    private readonly SemaphoreSlim _gate = new(1, 1);
    private IReadOnlyList<CatalogCard>? _cards;
    private DateTimeOffset _fetchedAt;

    private bool Fresh => _cards is not null && DateTimeOffset.UtcNow - _fetchedAt < Ttl;

    public async Task<IReadOnlyList<CatalogCard>> GetAsync(CancellationToken ct = default)
    {
        if (Fresh)
        {
            return _cards!;
        }
        await _gate.WaitAsync(ct);
        try
        {
            if (Fresh)
            {
                return _cards!;
            }
            using var scope = scopeFactory.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleClient>();
            try
            {
                var fetched = await client.GetAllCardsAsync(ct);
                if (fetched.Count > 0)
                {
                    _cards = fetched;
                    _fetchedAt = DateTimeOffset.UtcNow;
                }
            }
            catch when (_cards is not null)
            {
                // A refresh failure should not break the app when we already have a
                // usable catalog; serve the last good copy until the next attempt.
            }
            return _cards ?? [];
        }
        finally
        {
            _gate.Release();
        }
    }
}
