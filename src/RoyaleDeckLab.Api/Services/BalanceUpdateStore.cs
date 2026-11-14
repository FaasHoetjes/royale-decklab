using System.Collections.Concurrent;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// The balance updates the patch notes watch has read, kept in the database so updates whose posts have slid out of
/// the watch's reach are still shown.
/// </summary>
public sealed class BalanceUpdateStore(IServiceScopeFactory scopeFactory, ILogger<BalanceUpdateStore> logger)
{
    private IReadOnlyList<PostedUpdate>? _posted;
    private long _version;
    private readonly ConcurrentDictionary<string, bool> _reportedTitles = new();

    /// <summary>Goes up whenever the stored updates change, so cached responses showing them are dropped.</summary>
    public long Version => Interlocked.Read(ref _version);

    /// <summary>Nothing while the catalog isn't in, rather than every name reported as one no card goes by.</summary>
    public IReadOnlyList<BalanceUpdate> During(CardStatsResponse stats, IReadOnlyList<CatalogCard> cards)
        => cards.Count == 0 ? [] : BalanceUpdates.During(BalanceUpdates.Resolve(Posted(), cards, ReportUnmatched), stats);

    public async Task SaveAsync(IReadOnlyList<PostedUpdate> found, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        if (!await store.SaveBalanceUpdatesAsync(found, ct))
        {
            return;
        }
        var stored = store.GetBalanceUpdates();
        Volatile.Write(ref _posted, stored);
        Interlocked.Increment(ref _version);
        logger.LogInformation("Balance updates now stored: {Days}", string.Join(", ", stored.Select(u => u.Day.ToString("yyyy-MM-dd"))));
    }

    private IReadOnlyList<PostedUpdate> Posted()
    {
        if (Volatile.Read(ref _posted) is { } posted)
        {
            return posted;
        }
        using var scope = scopeFactory.CreateScope();
        var loaded = scope.ServiceProvider.GetRequiredService<BattleRepository>().GetBalanceUpdates();
        // A save that landed meanwhile has the newer list.
        return Interlocked.CompareExchange(ref _posted, loaded, null) ?? loaded;
    }

    private void ReportUnmatched(string title)
    {
        if (_reportedTitles.TryAdd(title, true))
        {
            logger.LogWarning("No card goes by \"{Title}\" from the balance notes, so its change isn't shown", title);
        }
    }
}
