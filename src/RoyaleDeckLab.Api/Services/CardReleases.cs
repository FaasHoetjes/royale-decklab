using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardRelease(long FirstSeenMs, IReadOnlyList<CardVersion> Versions);

/// <summary>
/// Spots new cards, Evos and Heroes in crawled war battles. The battles say when one became playable, which needn't
/// be the season start (Mirror's Evo first turned up a week into the November 2026 season) nor the day the catalog
/// lists it.
/// </summary>
public sealed class CardReleases(CardCatalog catalog, ILogger<CardReleases> logger)
{
    /// <summary>
    /// The versions in <paramref name="fresh"/> that haven't been seen before, with the first battle that used one.
    /// The first call only remembers what exists, so that the versions already out don't count as new.
    /// </summary>
    public async Task<CardRelease?> FindNewAsync(BattleRepository store, IReadOnlyList<BattleRecord> fresh, CancellationToken ct)
    {
        var known = store.GetKnownCardVersions();
        if (known.Count == 0)
        {
            await SeedAsync(store, ct);
            return null;
        }

        var firstSeen = new Dictionary<CardVersion, long>();
        foreach (var battle in fresh)
        {
            foreach (var version in Played(battle))
            {
                if (!known.Contains(version)
                    && (!firstSeen.TryGetValue(version, out var seen) || battle.BattleTimeMs < seen))
                {
                    firstSeen[version] = battle.BattleTimeMs;
                }
            }
        }
        return firstSeen.Count == 0 ? null : new CardRelease(firstSeen.Values.Min(), firstSeen.Keys.ToList());
    }

    // Seeded from the catalog as well as the stored battles: an Evo nobody played in the last 30 days isn't new.
    private async Task SeedAsync(BattleRepository store, CancellationToken ct)
    {
        IReadOnlyList<CatalogCard> cards;
        try
        {
            cards = await catalog.GetAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Card catalog unavailable; new card versions are watched from the next crawl");
            return;
        }
        if (cards.Count == 0)
        {
            return;
        }

        var versions = cards.SelectMany(InCatalog).Concat(store.AllBattles().SelectMany(Played)).ToHashSet();
        await store.AddKnownCardVersionsAsync(versions, ct);
        logger.LogInformation("Card release watch initialised with {Count} card versions", versions.Count);
    }

    private static IEnumerable<CardVersion> Played(BattleRecord battle)
        => battle.CardIds.Select(id => new CardVersion(id, CardVersionKind.Normal)).Concat(battle.CardVersions);

    private static IEnumerable<CardVersion> InCatalog(CatalogCard card)
    {
        yield return new CardVersion(card.Id, CardVersionKind.Normal);
        var bits = card.MaxEvolutionLevel ?? 0;
        if (EvolutionBits.OwnsEvo(bits))
        {
            yield return new CardVersion(card.Id, CardVersionKind.Evo);
        }
        if (EvolutionBits.OwnsHero(bits))
        {
            yield return new CardVersion(card.Id, CardVersionKind.Hero);
        }
    }
}
