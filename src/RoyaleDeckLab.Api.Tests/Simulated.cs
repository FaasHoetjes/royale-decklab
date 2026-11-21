using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

internal static class Simulated
{
    public const double PerLevel = 1.5;
    public const double PerEvo = 0.3;
    public const double PerHero = 0.1;
    private const double PerChampion = 0.05;
    private const int Champion = 9999;
    public static readonly IReadOnlySet<int> Champions = new HashSet<int> { Champion };

    public static IEnumerable<Duel> Duels(int cap, int count, bool specialsFollowSkill = false, bool heroes = true)
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
            var champions = hasChampion ? 1 : 0;
            var heroCount = heroes ? Math.Min(Specials(player, 2 - champions), 3 - evos - champions) : 0;
            var cards = Enumerable.Range(0, 8)
                .Select(i => new CrownSeriesCard(
                    hasChampion && i == 7 ? Champion : deck * 8 + i,
                    random.NextDouble() < 0.8 ? cap : cap - 1 - random.Next(2),
                    i < evos ? CardVersionKind.Evo
                    : i < evos + heroCount || (hasChampion && i == 7) ? CardVersionKind.Hero
                    : CardVersionKind.Normal))
                .ToList();
            var value = PerLevel * cards.Average(c => c.Level) + PerEvo * evos + PerHero * heroCount
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

    public static IEnumerable<CrownSeriesRound> Rounds(Duel duel, long battleTimeMs)
        => duel.Rounds.SelectMany((r, i) => new[]
        {
            Round(r.First, r.Second, i, battleTimeMs, r.FirstWon),
            Round(r.Second, r.First, i, battleTimeMs, !r.FirstWon),
        });

    private static CrownSeriesRound Round(DuelSide side, DuelSide opponent, int round, long battleTimeMs, bool won) => new()
    {
        PlayerTag = side.PlayerTag,
        OpponentTag = opponent.PlayerTag,
        BattleTimeMs = battleTimeMs,
        Round = round,
        Result = won ? BattleResult.Win : BattleResult.Loss,
        Cards = side.Cards,
        League = 1,
        EventTag = "",
        GameModeId = 0,
    };
}
