namespace RoyaleDeckLab.Api.Dtos;

public static class UpgradeKind
{
    public const string Level = "level";
    public const string Evo = "evo";
    public const string Hero = "hero";
}

/// <summary>
/// Kind "level" raises the card from <see cref="FromLevel"/> to <see cref="ToLevel"/>
/// (possibly more than one level, when that's the cheapest jump that changes the
/// lineup); "evo"/"hero" unlock that special version (levels unchanged).
/// <see cref="AffectedDeckIndexes"/> empty with <see cref="ChangesLineup"/> true means
/// the upgrade promotes a deck that isn't in the current lineup at all.
/// </summary>
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
    IReadOnlyList<int> AffectedDeckIndexes);
