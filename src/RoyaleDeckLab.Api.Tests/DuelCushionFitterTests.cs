using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelCushionFitterTests
{
    [Fact]
    public void Finds_the_spread_the_decks_were_given()
    {
        var fits = DuelCushionFitter.Fit(Simulated.SpreadDecks(cap: 12, spread: 0.07, decks: 400, roundsPerDeck: 100));

        var all = Assert.Single(fits, f => f.Cap == DuelLevelFitter.AllCaps);
        Assert.Equal(400, all.Decks);
        Assert.InRange(all.Spread, 0.06, 0.08);
        // 0.25 / 0.07² - 1 ≈ 50
        Assert.InRange(all.PriorRounds, 35, 70);
        Assert.Equal(all.PriorRounds, Assert.Single(fits, f => f.Cap == 12).PriorRounds, 10);
    }

    [Fact]
    public void Finds_the_spread_of_decks_with_few_rounds()
    {
        var fits = DuelCushionFitter.Fit(Simulated.SpreadDecks(cap: 12, spread: 0.07, decks: 20_000, roundsPerDeck: 10));

        var all = Assert.Single(fits, f => f.Cap == DuelLevelFitter.AllCaps);
        Assert.InRange(all.PriorRounds, 45, 55);
    }

    [Fact]
    public void Leaves_out_a_cap_whose_decks_differ_no_more_than_luck()
    {
        var fits = DuelCushionFitter.Fit(Simulated.SpreadDecks(cap: 12, spread: 0, decks: 400, roundsPerDeck: 100, exact: true));

        Assert.Empty(fits);
    }

    [Fact]
    public void Pools_caps_by_each_caps_own_average()
    {
        var low = Simulated.SpreadDecks(cap: 11, spread: 0.07, decks: 300, roundsPerDeck: 100, average: 0.4, seed: 1);
        var high = Simulated.SpreadDecks(cap: 16, spread: 0.07, decks: 300, roundsPerDeck: 100, average: 0.6, seed: 2, firstDeck: 1_000);

        var all = Assert.Single(DuelCushionFitter.Fit(low.Concat(high)), f => f.Cap == DuelLevelFitter.AllCaps);

        Assert.Equal(600, all.Decks);
        Assert.InRange(all.Spread, 0.06, 0.08);
    }

    [Fact]
    public void Skips_a_cap_with_too_few_measured_decks()
    {
        var fits = DuelCushionFitter.Fit(
            Simulated.SpreadDecks(cap: 12, spread: 0.07, decks: DuelCushionFitter.MinDecks - 1, roundsPerDeck: 100));

        Assert.Empty(fits);
    }
}
