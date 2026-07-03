namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// One recommended card upgrade and its effect on the player's war lineup.
/// <see cref="AffectedDeckIndexes"/> are the baseline decks (0-3) containing the
/// card; empty with <see cref="ChangesLineup"/> true means the upgrade promotes
/// a deck that isn't in the current lineup at all.
/// </summary>
public sealed record UpgradeSuggestion(
    int CardId,
    string? Name,
    int FromLevel,
    int ToLevel,
    int MaxLevel,
    int? ElixirCost,
    CardIconUrls? IconUrls,
    double ScoreDelta,
    double NewTotalScore,
    bool ChangesLineup,
    IReadOnlyList<int> AffectedDeckIndexes);
