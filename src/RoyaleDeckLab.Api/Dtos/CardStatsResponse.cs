namespace RoyaleDeckLab.Api.Dtos;

/// <summary>
/// Every card's war numbers since <see cref="Since"/> (null: all stored battles). When this patch has
/// too few battles yet, <see cref="IsLastPatch"/> is set and the numbers cover the last patch, up to <see cref="Until"/>.
/// </summary>
public sealed record CardStatsResponse(
    string? Since,
    string? Until,
    int Battles,
    bool IsLastPatch,
    IReadOnlyList<CardStat> Cards);

/// <summary>
/// Win rate change since the last patch is only set when both patches have enough games. <see cref="ChangeMargin"/> is how far
/// chance alone could move it with this many games, and <see cref="ChangeIsClear"/> means the change is bigger than that.
/// </summary>
public sealed record CardStat(
    int Id,
    int Games,
    double WinRate,
    double PlayRate,
    double EvoShare,
    double HeroShare,
    int PreviousGames,
    double? PreviousWinRate,
    double? PreviousPlayRate,
    double? WinRateChange,
    double? ChangeMargin,
    bool ChangeIsClear);
