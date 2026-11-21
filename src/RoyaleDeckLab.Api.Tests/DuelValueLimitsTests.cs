using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelValueLimitsTests
{
    private static readonly DuelValues Current = new(new LevelFit(1.80, 0.07), new SpecialValues(0.32, 0.12), PriorRounds: 80);

    [Fact]
    public void The_first_fit_replaces_the_defaults()
    {
        var (levels, specials) = DuelValueLimits.StepLevels(Current, Fit(perLevel: 2.10, evo: 0.40), first: true)!.Value;

        Assert.Equal(2.10, levels.PerLevel, 10);
        Assert.Equal(0.40, specials.Evo, 10);
        Assert.Equal(43, DuelValueLimits.StepPriorRounds(Current, Cushion(43), first: true));
    }

    [Fact]
    public void A_later_fit_moves_each_value_at_most_one_step()
    {
        var (levels, specials) = DuelValueLimits.StepLevels(Current, Fit(perLevel: 2.10, evo: 0.40, hero: 0.13), first: false)!.Value;

        Assert.Equal(1.95, levels.PerLevel, 10);
        Assert.Equal(0.07, levels.WeakestCard, 10);
        Assert.Equal(0.34, specials.Evo, 10);
        Assert.Equal(0.13, specials.Hero, 10);
        Assert.Equal(72, DuelValueLimits.StepPriorRounds(Current, Cushion(43), first: false));
    }

    [Theory]
    [InlineData(4.0, 0.07, 0.32, 0.12)]
    [InlineData(1.80, -0.05, 0.32, 0.12)]
    [InlineData(1.80, 0.07, 0.9, 0.12)]
    [InlineData(1.80, 0.07, 0.32, 0.5)]
    public void Skips_a_level_fit_outside_the_bounds(double perLevel, double weakestCard, double evo, double hero)
        => Assert.Null(DuelValueLimits.StepLevels(Current, Fit(perLevel, weakestCard, evo, hero), first: true));

    [Fact]
    public void Skips_a_level_fit_from_too_few_duels()
        => Assert.Null(DuelValueLimits.StepLevels(Current, Fit(duels: DuelValueLimits.MinLevelDuels - 1), first: false));

    [Theory]
    [InlineData(10)]
    [InlineData(500)]
    public void Skips_a_cushion_outside_the_bounds(double priorRounds)
        => Assert.Null(DuelValueLimits.StepPriorRounds(Current, Cushion(priorRounds), first: true));

    private static DuelLevelFit Fit(
        double perLevel = 1.80, double weakestCard = 0.07, double evo = 0.32, double hero = 0.12, int duels = 30_000)
        => new(DuelLevelFitter.AllCaps, duels, new(perLevel, 0.05), new(weakestCard, 0.02), new(evo, 0.01), new(hero, 0.01));

    private static DuelCushionFit Cushion(double priorRounds) => new(DuelLevelFitter.AllCaps, 2_900, 125_000, 0.075, priorRounds);
}
