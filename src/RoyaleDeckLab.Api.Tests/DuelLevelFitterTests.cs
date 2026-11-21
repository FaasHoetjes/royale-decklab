using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelLevelFitterTests
{
    private static readonly IReadOnlySet<int> Champions = Simulated.Champions;

    [Fact]
    public void Recovers_the_level_evo_and_hero_effects_the_duels_were_played_with()
    {
        var fit = DuelLevelFitter.Fit(Simulated.Duels(cap: 11, count: 40_000), Champions).Single(f => f.Cap == 11);

        Assert.Equal(11, fit.Cap);
        Assert.Equal(Simulated.PerLevel, fit.PerLevel.Value, 0.15);
        Assert.Equal(Simulated.PerEvo, fit.Evo.Value, 0.05);
        Assert.Equal(Simulated.PerHero, fit.Hero.Value, 0.05);
        Assert.Equal(0, fit.WeakestCard.Value, 0.08);
        Assert.InRange(fit.Evo.StandardError, 0.005, 0.04);
    }

    [Fact]
    public void Isnt_fooled_when_stronger_players_own_more_evos_and_heroes()
    {
        var fit = DuelLevelFitter.Fit(Simulated.Duels(cap: 14, count: 40_000, specialsFollowSkill: true), Champions)
            .Single(f => f.Cap == 14);

        Assert.Equal(Simulated.PerEvo, fit.Evo.Value, 0.05);
        Assert.Equal(Simulated.PerHero, fit.Hero.Value, 0.05);
    }

    [Fact]
    public void Skips_a_cap_with_too_few_duels_that_went_to_a_third_round_but_counts_them_across_every_cap()
    {
        var duels = Simulated.Duels(cap: 12, count: 10_000).Concat(Simulated.Duels(cap: 13, count: 1_000)).ToList();

        var fits = DuelLevelFitter.Fit(duels, Champions);

        Assert.Equal([DuelLevelFitter.AllCaps, 12], fits.Select(f => f.Cap));
        Assert.Equal(duels.Count(d => d.Rounds.Count == 3), fits[0].Duels);
    }

    [Fact]
    public void Leaves_out_a_duel_whose_results_couldnt_have_been_played()
    {
        var duels = Simulated.Duels(cap: 15, count: 5_000).ToList();
        var played = duels.First(d => d.Rounds.Count == 3);
        var impossible = played with { Rounds = played.Rounds.Select(r => r with { FirstWon = true }).ToList() };

        var fit = DuelLevelFitter.Fit([.. duels, impossible], Champions).Single(f => f.Cap == 15);

        Assert.Equal(duels.Count(d => d.Rounds.Count == 3), fit.Duels);
    }

    [Fact]
    public void Keeps_the_other_caps_when_one_cant_be_fitted()
    {
        var duels = Simulated.Duels(cap: 12, count: 10_000).Concat(Simulated.Duels(cap: 16, count: 10_000, heroes: false));

        var fits = DuelLevelFitter.Fit(duels, Champions);

        Assert.Equal([DuelLevelFitter.AllCaps, 12], fits.Select(f => f.Cap));
    }
}
