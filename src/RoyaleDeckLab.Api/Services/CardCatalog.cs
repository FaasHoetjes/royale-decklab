using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Lazily-fetched, in-memory cache of the full card catalog. Singleton; the
/// one-time fetch is resolved through a scope since the CR client is registered
/// as a typed HttpClient.
/// </summary>
public sealed class CardCatalog(IServiceScopeFactory scopeFactory)
{
    private readonly SemaphoreSlim _gate = new(1, 1);
    private IReadOnlyList<CatalogCard>? _cards;

    public async Task<IReadOnlyList<CatalogCard>> GetAsync(CancellationToken ct = default)
    {
        if (_cards is not null)
        {
            return _cards;
        }
        await _gate.WaitAsync(ct);
        try
        {
            if (_cards is not null)
            {
                return _cards;
            }
            using var scope = scopeFactory.CreateScope();
            var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleClient>();
            _cards = await client.GetAllCardsAsync(ct);
            return _cards;
        }
        finally
        {
            _gate.Release();
        }
    }
}
