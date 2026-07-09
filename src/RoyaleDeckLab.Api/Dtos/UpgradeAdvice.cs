namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// <see cref="CollectionMaxed"/> true means every meta card is maxed and every
/// special version the meta fields is unlocked (nothing to simulate) — distinct
/// from "upgrades exist but none moves the lineup" (suggestions empty, flag false).
/// </summary>
public sealed record UpgradeAdvice(
    double BaselineScore,
    IReadOnlyList<UpgradeSuggestion> Suggestions,
    bool CollectionMaxed);
