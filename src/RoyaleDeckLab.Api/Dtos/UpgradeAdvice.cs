namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// Ranked upgrade suggestions against the player's baseline lineup score.
/// <see cref="CollectionMaxed"/> is true when there was nothing to even
/// simulate: every meta card is at max level and every special version the meta
/// fields is unlocked — distinct from "upgrades exist but none moves the
/// lineup" (suggestions empty, flag false), so the client can congratulate
/// instead of consoling.
/// </summary>
public sealed record UpgradeAdvice(
    double BaselineScore,
    IReadOnlyList<UpgradeSuggestion> Suggestions,
    bool CollectionMaxed);
