namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// How card levels move Crown Series Duel odds, fitted on 56,516 paired King's League rounds (first Duel weekend,
/// Nov 2026). Matchmaking pairs players of about the same levels, so the opponent tracks the player; what costs a
/// round is a deck sitting below the player's own level, ~1.67 log-odds a level with the decks' win rates held
/// fixed, far more than in war.
/// </summary>
public static class CrownSeriesLevels
{
    public static LevelFit Fit { get; } = new(PerLevel: 1.67, WeakestCard: 0.04);

    /// <summary>
    /// Log-odds a Duel deck loses for each special slot left without an evo or hero, fitted on 57,522 paired rounds
    /// (Nov 2026) with levels, deck strength and player skill held fixed: 0.24 ± 0.03. Fielding a different special
    /// than the meta deck's costs nothing (−0.03 ± 0.03). Caps 11-13 alone gave 0.13 ± 0.08 from 2,181 rounds.
    /// </summary>
    public const double EmptySpecialSlot = 0.24;

    // Opponents' average deck level from the player's (26,082 players): pulled only slightly toward ~16.
    private const double OpponentIntercept = 1.48;
    private const double OpponentSlope = 0.91;

    /// <param name="cappedCards">The player's cards at the levels the league lets them play at.</param>
    public static double OpponentLevel(IEnumerable<PlayerItemLevel> cappedCards, CrownSeriesLeague league)
    {
        var best = cappedCards
            .Select(LevelModel.DisplayLevel)
            .OrderDescending()
            .Take(LevelModel.LineupCards)
            .ToList();
        var typical = best.Count > 0 ? best.Average() : league.LevelCap();
        return Math.Min(league.LevelCap(), OpponentIntercept + OpponentSlope * typical);
    }
}
