namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Ranked upgrade suggestions against the player's baseline lineup score.</summary>
public sealed record UpgradeAdvice(
    double BaselineScore,
    IReadOnlyList<UpgradeSuggestion> Suggestions);
