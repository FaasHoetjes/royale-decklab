using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Moves Duel scoring toward the newest all-caps refit, within <see cref="DuelValueLimits"/>.</summary>
public sealed class DuelValuesApplier(
    DuelLevelFitRepository fits,
    DuelValuesStore store,
    IOptions<CrownSeriesOptions> options,
    ILogger<DuelValuesApplier> logger)
{
    /// <returns>Whether the values changed, so the Duel decks need building again.</returns>
    public async Task<bool> ApplyAsync(long nowMs, CancellationToken ct = default)
    {
        var applied = store.Current;
        var values = applied.Values;
        var (levelsAt, cushionAt) = (applied.LevelsFittedAtMs, applied.CushionFittedAtMs);

        if (options.Value.ApplyLevelRefits && fits.LatestAllCapsLevelFit() is { } level && level.FittedAtMs > levelsAt)
        {
            if (DuelValueLimits.StepLevels(values, level.Fit, first: levelsAt == 0) is var (levels, specials))
            {
                values = values with { Levels = levels, Specials = specials };
                levelsAt = level.FittedAtMs;
            }
            else
            {
                logger.LogWarning(
                    "Duel level refit of {FittedAtMs} is outside the limits ({Duels} Duels, level {PerLevel:F2}, weakest card {WeakestCard:F2}, evo {Evo:F2}, hero {Hero:F2}); keeping the values in use",
                    level.FittedAtMs, level.Fit.Duels, level.Fit.PerLevel.Value, level.Fit.WeakestCard.Value, level.Fit.Evo.Value, level.Fit.Hero.Value);
            }
        }

        if (options.Value.ApplyCushionRefits && fits.LatestAllCapsCushion() is { } cushion && cushion.FittedAtMs > cushionAt)
        {
            if (DuelValueLimits.StepPriorRounds(values, cushion.Fit, first: cushionAt == 0) is { } priorRounds)
            {
                values = values with { PriorRounds = priorRounds };
                cushionAt = cushion.FittedAtMs;
            }
            else
            {
                logger.LogWarning(
                    "Duel cushion refit of {FittedAtMs} is outside the limits ({PriorRounds:F0} rounds); keeping the cushion in use",
                    cushion.FittedAtMs, cushion.Fit.PriorRounds);
            }
        }

        if (levelsAt == applied.LevelsFittedAtMs && cushionAt == applied.CushionFittedAtMs)
        {
            return false;
        }
        var next = new AppliedDuelValues(values, nowMs, levelsAt, cushionAt);
        await fits.SaveAppliedAsync(next, ct);
        store.Set(next);
        logger.LogInformation(
            "Duel scoring now runs on level {PerLevel:F2}, weakest card {WeakestCard:F2}, evo {Evo:F2}, hero {Hero:F2}, cushion {PriorRounds:F0} rounds",
            values.Levels.PerLevel, values.Levels.WeakestCard, values.Specials.Evo, values.Specials.Hero, values.PriorRounds);
        return values != applied.Values;
    }
}
