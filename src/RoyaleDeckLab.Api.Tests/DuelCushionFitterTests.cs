using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelCushionFitterTests
{
    [Fact]
    public void Finds_the_spread_the_decks_were_given()
    {
        var fits = DuelCushionFitter.Fit(Duels(cap: 12, spread: 0.07, decks: 400, roundsPerDeck: 100));

        var all = Assert.Single(fits, f => f.Cap == DuelLevelFitter.AllCaps);
        Assert.Equal(400, all.Decks);
        Assert.InRange(all.Spread, 0.06, 0.08);
        // 0.25 / 0.07² - 1 ≈ 50
        Assert.InRange(all.PriorRounds, 35, 70);
        Assert.Equal(all.PriorRounds, Assert.Single(fits, f => f.Cap == 12).PriorRounds, 10);
    }

    [Fact]
    public void Calls_for_a_large_cushion_when_only_luck_sets_decks_apart()
    {
        var fits = DuelCushionFitter.Fit(Duels(cap: 12, spread: 0, decks: 400, roundsPerDeck: 100));

        Assert.All(fits, f => Assert.True(f.PriorRounds > 300, $"cushion {f.PriorRounds}"));
    }

    [Fact]
    public void Pools_caps_by_each_caps_own_average()
    {
        var low = Duels(cap: 11, spread: 0.07, decks: 200, roundsPerDeck: 100, average: 0.4, seed: 1);
        var high = Duels(cap: 16, spread: 0.07, decks: 200, roundsPerDeck: 100, average: 0.6, seed: 2, firstDeck: 1_000);

        var all = Assert.Single(DuelCushionFitter.Fit(low.Concat(high)), f => f.Cap == DuelLevelFitter.AllCaps);

        Assert.Equal(400, all.Decks);
        Assert.InRange(all.Spread, 0.06, 0.08);
    }

    [Fact]
    public void Skips_a_cap_with_too_few_measured_decks()
    {
        var fits = DuelCushionFitter.Fit(Duels(cap: 12, spread: 0.07, decks: DuelCushionFitter.MinDecks - 1, roundsPerDeck: 100));

        Assert.Empty(fits);
    }

    // Each measured deck meets a deck seen only once, so only the measured decks reach the rounds the fit counts.
    private static List<Duel> Duels(
        int cap, double spread, int decks, int roundsPerDeck, double average = 0.5, int seed = 0, int firstDeck = 0)
    {
        var random = new Random(seed);
        var duels = new List<Duel>();
        var opponent = 1_000_000 + firstDeck * 1_000;
        for (var d = 0; d < decks; d++)
        {
            var winRate = average + (d % 2 == 0 ? spread : -spread);
            var deck = Side($"#P{firstDeck + d}", 8 * (firstDeck + d));
            for (var r = 0; r < roundsPerDeck; r++)
            {
                var round = new PairedRound(deck, Side("#O", 8 * opponent++), random.NextDouble() < winRate);
                duels.Add(new Duel(cap, [round]));
            }
        }
        return duels;
    }

    private static DuelSide Side(string tag, int firstCard)
        => new(tag, Enumerable.Range(firstCard, 8).Select(id => new CrownSeriesCard(id, 12, CardVersionKind.Normal)).ToList());
}
