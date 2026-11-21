using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>The Duel values scoring runs on now, read from the store the first time they're needed.</summary>
public sealed class DuelValuesStore(IServiceScopeFactory scopeFactory)
{
    private readonly Lock _loadGate = new();
    private AppliedDuelValues? _current;

    public AppliedDuelValues Current
    {
        get
        {
            if (Volatile.Read(ref _current) is { } current)
            {
                return current;
            }
            lock (_loadGate)
            {
                if (_current is null)
                {
                    using var scope = scopeFactory.CreateScope();
                    _current = scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>().LatestApplied()
                        ?? AppliedDuelValues.Default;
                }
                return _current;
            }
        }
    }

    public void Set(AppliedDuelValues values) => Volatile.Write(ref _current, values);
}
