using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>The season's boosted cards as last detected, kept in the database so a restart doesn't forget them.</summary>
public sealed class SeasonBoostStore(IServiceScopeFactory scopeFactory, ILogger<SeasonBoostStore> logger)
{
    private SeasonBoosts? _current;

    public SeasonBoosts Current
    {
        get
        {
            if (Volatile.Read(ref _current) is { } current)
            {
                return current;
            }
            using var scope = scopeFactory.CreateScope();
            var loaded = new SeasonBoosts(scope.ServiceProvider.GetRequiredService<BattleRepository>().GetSeasonBoosts());
            // A save that landed meanwhile has the newer set.
            return Interlocked.CompareExchange(ref _current, loaded, null) ?? loaded;
        }
    }

    public async Task SaveAsync(IReadOnlySet<int> cardIds, CancellationToken ct)
    {
        if (Current.CardIds.SetEquals(cardIds))
        {
            return;
        }
        using var scope = scopeFactory.CreateScope();
        await scope.ServiceProvider.GetRequiredService<BattleRepository>().ReplaceSeasonBoostsAsync(cardIds, ct);
        Volatile.Write(ref _current, new SeasonBoosts(cardIds));
        logger.LogInformation("Season boosts are now cards {@CardIds}", cardIds.Order());
    }
}
