using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelLevelFitterTests
{
    private const double PerLevel = 1.5;
    private const double PerEvo = 0.3;
    private const double PerHero = 0.1;
    private const double PerChampion = 0.05;
    private const int Champion = 9999;
    private static readonly IReadOnlySet<int> Champions = new HashSet<int> { Champion };

    [Fact]
    public void Recovers_the_level_evo_and_hero_effects_the_duels_were_played_with()
    {
        var fit = Assert.Single(DuelLevelFitter.Fit(SimulatedDuels(cap: 11, count: 40_000), Champions));

        Assert.Equal(11, fit.Cap);
        Assert.Equal(PerLevel, fit.PerLevel.Value, 0.15);
        Assert.Equal(PerEvo, fit.Evo.Value, 0.05);
        Assert.Equal(PerHero, fit.Hero.Value, 0.05);
        Assert.Equal(0, fit.WeakestCard.Value, 0.08);
        Assert.InRange(fit.Evo.StandardError, 0.005, 0.04);
    }

    [Fact]
    public void Isnt_fooled_when_stronger_players_own_more_evos_and_heroes()
    {
        var fit = Assert.Single(DuelLevelFitter.Fit(SimulatedDuels(cap: 14, count: 40_000, specialsFollowSkill: true), Champions));

        Assert.Equal(PerEvo, fit.Evo.Value, 0.05);
        Assert.Equal(PerHero, fit.Hero.Value, 0.05);
    }

    [Fact]
    public void Skips_a_cap_with_too_few_duels_that_went_to_a_third_round()
    {
        var duels = SimulatedDuels(cap: 12, count: 10_000).Concat(SimulatedDuels(cap: 13, count: 1_000));

        var fit = Assert.Single(DuelLevelFitter.Fit(duels, Champions));

        Assert.Equal(12, fit.Cap);
    }

    private static IEnumerable<Duel> SimulatedDuels(int cap, int count, bool specialsFollowSkill = false)
    {
        var random = new Random(cap);
        var skills = Enumerable.Range(0, 5000).Select(_ => Normal(random) * 0.8).ToArray();
        var decks = Enumerable.Range(0, 150).Select(_ => Normal(random) * 0.3).ToArray();

        int Specials(int player, int most) => specialsFollowSkill
            ? Math.Clamp((int)Math.Round(most / 2.0 + skills[player] + Normal(random) * 0.6), 0, most)
            : random.Next(most + 1);

        (DuelSide Side, double Strength) Deck(int player)
        {
            var deck = random.Next(decks.Length);
            var hasChampion = deck % 3 == 0;
            var evos = Specials(player, 2);
            var heroes = Math.Min(Specials(player, 2), 3 - evos - (hasChampion ? 1 : 0));
            var cards = Enumerable.Range(0, 8)
                .Select(i => new CrownSeriesCard(
                    hasChampion && i == 7 ? Champion : deck * 8 + i,
                    random.NextDouble() < 0.8 ? cap : cap - 1 - random.Next(2),
                    i < evos ? CardVersionKind.Evo
                    : i < evos + heroes || (hasChampion && i == 7) ? CardVersionKind.Hero
                    : CardVersionKind.Normal))
                .ToList();
            var value = PerLevel * cards.Average(c => c.Level) + PerEvo * evos + PerHero * heroes
                + (hasChampion ? PerChampion : 0);
            return (new DuelSide($"#P{player}", cards), decks[deck] + value);
        }

        for (var i = 0; i < count; i++)
        {
            var (first, second) = (random.Next(skills.Length), random.Next(skills.Length));
            var rounds = new List<PairedRound>();
            var (firstWins, secondWins) = (0, 0);
            while (firstWins < 2 && secondWins < 2)
            {
                var a = Deck(first);
                var b = Deck(second);
                var logit = a.Strength - b.Strength + skills[first] - skills[second];
                var firstWon = random.NextDouble() < 1 / (1 + Math.Exp(-logit));
                rounds.Add(new PairedRound(a.Side, b.Side, firstWon));
                (firstWins, secondWins) = firstWon ? (firstWins + 1, secondWins) : (firstWins, secondWins + 1);
            }
            yield return new Duel(cap, rounds);
        }
    }

    private static double Normal(Random random)
        => Math.Sqrt(-2 * Math.Log(1 - random.NextDouble())) * Math.Cos(2 * Math.PI * random.NextDouble());
}
