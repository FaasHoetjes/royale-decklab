namespace RoyaleDeckLab.Api.Models;

/// <summary>What Duel scoring runs on: how levels and specials move a round, and the cushion decks are weighed against.</summary>
/// <param name="PriorRounds">The imaginary rounds at 50% that each deck's record is weighed against.</param>
public sealed record DuelValues(LevelFit Levels, SpecialValues Specials, double PriorRounds)
{
    // Duels started out with war's cushion.
    public static DuelValues Default { get; } = new(CrownSeriesLevels.Fit, CrownSeriesLevels.Specials, PriorRounds: 80);
}

/// <param name="LevelsFittedAtMs">The refit the level values came from; 0 while they are still the defaults.</param>
/// <param name="CushionFittedAtMs">The refit the cushion came from; 0 while it is still the default.</param>
public sealed record AppliedDuelValues(DuelValues Values, long AppliedAtMs, long LevelsFittedAtMs, long CushionFittedAtMs)
{
    public static AppliedDuelValues Default { get; } = new(DuelValues.Default, 0, 0, 0);
}
