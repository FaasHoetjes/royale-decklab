using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// How far a weekly refit may move Duel scoring. Each value moves toward the fit by at most its step, so a real shift is
/// followed over a few weeks and one odd week can't swing it. A value up to one step past its bounds is noise near the
/// edge and counts as the bound; further out it points to a data error, and the fit is skipped. Each step is three times the usual weekly change, from per-day fits of Nov 2026 and a refit
/// spanning about four weekends.
/// </summary>
public static class DuelValueLimits
{
    // Each weekend had 15-20k Duels that went to a third round.
    public const int MinLevelDuels = 10_000;

    private static readonly Limit PerLevel = new(1.0, 3.0, 0.15);
    private static readonly Limit WeakestCard = new(0, 0.3, 0.05);
    private static readonly Limit Evo = new(0, 0.6, 0.02);
    private static readonly Limit Hero = new(0, 0.4, 0.02);
    private static readonly Limit PriorRounds = new(20, 200, 8);

    /// <param name="first">The first fit applied replaces the defaults outright rather than stepping from them.</param>
    public static (LevelFit Levels, SpecialValues Specials)? StepLevels(DuelValues current, DuelLevelFit fit, bool first)
    {
        var holds = fit.Duels >= MinLevelDuels
            && PerLevel.Accepts(fit.PerLevel.Value)
            && WeakestCard.Accepts(fit.WeakestCard.Value)
            && Evo.Accepts(fit.Evo.Value)
            && Hero.Accepts(fit.Hero.Value);
        if (!holds)
        {
            return null;
        }
        return (
            new LevelFit(
                PerLevel.Step(current.Levels.PerLevel, fit.PerLevel.Value, first),
                WeakestCard.Step(current.Levels.WeakestCard, fit.WeakestCard.Value, first)),
            new SpecialValues(
                Evo.Step(current.Specials.Evo, fit.Evo.Value, first),
                Hero.Step(current.Specials.Hero, fit.Hero.Value, first)));
    }

    /// <param name="first">The first fit applied replaces the default outright rather than stepping from it.</param>
    public static double? StepPriorRounds(DuelValues current, DuelCushionFit fit, bool first)
        => PriorRounds.Accepts(fit.PriorRounds) ? PriorRounds.Step(current.PriorRounds, fit.PriorRounds, first) : null;

    private sealed record Limit(double Min, double Max, double MaxStep)
    {
        public bool Accepts(double value) => value >= Min - MaxStep && value <= Max + MaxStep;

        public double Step(double current, double fitted, bool first)
        {
            var target = Math.Clamp(fitted, Min, Max);
            return first ? target : current + Math.Clamp(target - current, -MaxStep, MaxStep);
        }
    }
}
