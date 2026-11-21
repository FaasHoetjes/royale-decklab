using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record DuelSide(string PlayerTag, IReadOnlyList<CrownSeriesCard> Cards);

/// <param name="First">Always the same player across the rounds of one Duel.</param>
public sealed record PairedRound(DuelSide First, DuelSide Second, bool FirstWon);

public sealed record Duel(int Cap, IReadOnlyList<PairedRound> Rounds);

public readonly record struct Estimate(double Value, double StandardError);

public sealed record DuelLevelFit(
    int Cap, int Duels, Estimate PerLevel, Estimate WeakestCard, Estimate Evo, Estimate Hero);

/// <summary>
/// Fits how card levels and specials move Duel odds at each level cap by comparing the rounds of one Duel: the same two
/// players meet with different decks, so their skill cancels out. A Duel is a best of three, so only one that went to a
/// third round tells which of its first two each player won.
/// </summary>
public static class DuelLevelFitter
{
    public const int MinDuels = 1000;

    public const int AllCaps = 0;

    private const double DeckPriorRounds = 80;

    private const int WinsNeeded = 2;

    private const int Variables = 6;

    public static IReadOnlyList<DuelLevelFit> Fit(IEnumerable<Duel> duels, IReadOnlySet<int> champions)
    {
        var caps = duels
            .GroupBy(d => d.Cap)
            .OrderBy(g => g.Key)
            .Select(g => (Cap: g.Key, Choices: Choices(g.ToList(), champions)))
            .ToList();
        var everyCap = caps.SelectMany(c => c.Choices).ToList();
        return caps
            .Prepend((Cap: AllCaps, Choices: everyCap))
            .Where(c => c.Choices.Count >= MinDuels)
            .Select(c => FitChoices(c.Cap, c.Choices))
            .OfType<DuelLevelFit>()
            .ToList();
    }

    // A sequence of results no Duel could produce is a logging error.
    private static List<ConditionalLogit.Choice> Choices(List<Duel> duels, IReadOnlySet<int> champions)
    {
        var decks = new DeckRecords(duels.SelectMany(d => d.Rounds));
        return duels
            .Where(d => d.Rounds.Count == 2 * WinsNeeded - 1)
            .Select(duel => Choice(duel, decks, champions))
            .Where(choice => choice.Chosen >= 0)
            .ToList();
    }

    private static DuelLevelFit? FitChoices(int cap, List<ConditionalLogit.Choice> choices)
    {
        if (ConditionalLogit.Fit(choices) is not { } fit)
        {
            return null;
        }
        var (coefficients, covariance) = fit;

        // LevelFit scores PerLevel * mean gap - WeakestCard * (mean - weakest), which is (PerLevel - WeakestCard) on the
        // mean gap and WeakestCard on the weakest-card gap.
        var weakestCard = coefficients[1];
        var perLevel = coefficients[0] + coefficients[1];
        var perLevelVariance = covariance[0, 0] + covariance[1, 1] + 2 * covariance[0, 1];
        return new DuelLevelFit(
            cap,
            choices.Count,
            new Estimate(perLevel, Math.Sqrt(perLevelVariance)),
            new Estimate(weakestCard, Math.Sqrt(covariance[1, 1])),
            Coefficient(coefficients, covariance, 2),
            Coefficient(coefficients, covariance, 3));
    }

    private static Estimate Coefficient(double[] coefficients, double[,] covariance, int index)
        => new(coefficients[index], Math.Sqrt(covariance[index, index]));

    // Given how many rounds the first player won, the question is which ones: each way of winning that many that could
    // have been played out is an alternative, scored by the sum of the gaps in the rounds it wins.
    private static ConditionalLogit.Choice Choice(Duel duel, DeckRecords decks, IReadOnlySet<int> champions)
    {
        var gaps = duel.Rounds.Select(r => Gaps(r, decks, champions)).ToList();
        var wins = duel.Rounds.Count(r => r.FirstWon);
        var alternatives = new List<double[]>();
        var chosen = -1;
        for (var mask = 0; mask < 1 << gaps.Count; mask++)
        {
            if (int.PopCount(mask) != wins || !CouldBePlayed(mask, gaps.Count))
            {
                continue;
            }
            var sum = new double[Variables];
            for (var r = 0; r < gaps.Count; r++)
            {
                if ((mask & (1 << r)) != 0)
                {
                    for (var j = 0; j < Variables; j++)
                    {
                        sum[j] += gaps[r][j];
                    }
                }
            }
            if (Enumerable.Range(0, gaps.Count).All(r => ((mask & (1 << r)) != 0) == duel.Rounds[r].FirstWon))
            {
                chosen = alternatives.Count;
            }
            alternatives.Add(sum);
        }
        return new ConditionalLogit.Choice(alternatives, chosen);
    }

    private static bool CouldBePlayed(int mask, int rounds)
    {
        var (first, second) = (0, 0);
        for (var r = 0; r < rounds - 1; r++)
        {
            (first, second) = (mask & (1 << r)) != 0 ? (first + 1, second) : (first, second + 1);
            if (first == WinsNeeded || second == WinsNeeded)
            {
                return false;
            }
        }
        return true;
    }

    private static double[] Gaps(PairedRound round, DeckRecords decks, IReadOnlySet<int> champions)
    {
        var (first, second) = (round.First, round.Second);
        var firstWin = round.FirstWon ? 1.0 : 0.0;
        return
        [
            Mean(first) - Mean(second),
            Weakest(first) - Weakest(second),
            Count(first, CardVersionKind.Evo, champions) - Count(second, CardVersionKind.Evo, champions),
            Count(first, CardVersionKind.Hero, champions) - Count(second, CardVersionKind.Hero, champions),
            // Stored as heroes but never missing: counted apart so they don't skew the hero value.
            Champions(first, champions) - Champions(second, champions),
            decks.StrengthWithout(first.Cards, firstWin) - decks.StrengthWithout(second.Cards, 1 - firstWin),
        ];
    }

    private static double Mean(DuelSide side) => side.Cards.Average(c => c.Level);

    private static int Weakest(DuelSide side) => side.Cards.Min(c => c.Level);

    private static int Count(DuelSide side, CardVersionKind version, IReadOnlySet<int> champions)
        => side.Cards.Count(c => c.Version == version && !champions.Contains(c.Id));

    private static int Champions(DuelSide side, IReadOnlySet<int> champions) => side.Cards.Count(c => champions.Contains(c.Id));

    private sealed class DeckRecords
    {
        private readonly Dictionary<string, (double Wins, int Rounds)> _records = new(StringComparer.Ordinal);

        public DeckRecords(IEnumerable<PairedRound> rounds)
        {
            foreach (var round in rounds)
            {
                Add(round.First.Cards, round.FirstWon ? 1 : 0);
                Add(round.Second.Cards, round.FirstWon ? 0 : 1);
            }
        }

        public double StrengthWithout(IReadOnlyList<CrownSeriesCard> cards, double win)
        {
            var (wins, rounds) = _records[Key(cards)];
            var rate = (wins - win + DeckPriorRounds / 2) / (rounds - 1 + DeckPriorRounds);
            return Math.Log(rate / (1 - rate));
        }

        private void Add(IReadOnlyList<CrownSeriesCard> cards, double win)
        {
            var key = Key(cards);
            var (wins, rounds) = _records.GetValueOrDefault(key);
            _records[key] = (wins + win, rounds + 1);
        }

        private static string Key(IReadOnlyList<CrownSeriesCard> cards) => string.Join(',', cards.Select(c => c.Id).Order());
    }
}
