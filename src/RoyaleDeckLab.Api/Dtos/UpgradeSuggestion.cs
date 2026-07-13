namespace RoyaleDeckLab.Api.Dtos;

public static class UpgradeKind
{
    public const string Level = "level";
    public const string Evo = "evo";
    public const string Hero = "hero";
}

public sealed record UpgradeSuggestion(
    int CardId,
    string? Name,
    string Kind,
    int FromLevel,
    int ToLevel,
    int MaxLevel,
    int? ElixirCost,
    CardIconUrls? IconUrls,
    double ScoreDelta,
    double NewTotalScore,
    bool ChangesLineup,
    IReadOnlyList<int> AffectedDeckIndexes,
    BestDeckEntry? UnlockedDeck = null);
