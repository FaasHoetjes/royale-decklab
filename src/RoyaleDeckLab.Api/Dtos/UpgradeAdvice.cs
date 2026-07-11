namespace RoyaleDeckLab.Api.Dtos;

public sealed record UpgradeAdvice(
    double BaselineScore,
    IReadOnlyList<UpgradeSuggestion> Suggestions,
    bool CollectionMaxed);
