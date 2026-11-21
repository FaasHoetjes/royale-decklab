namespace RoyaleDeckLab.Api.Services;

/// <param name="Spread">The standard deviation of the decks' true win rates, once luck is taken out.</param>
/// <param name="PriorRounds">The imaginary rounds at the average that pull a deck's record in as far as that spread calls for.</param>
public sealed record DuelCushionFit(int Cap, int Decks, int Rounds, double Spread, double PriorRounds);

/// <summary>
/// Measures how many imaginary rounds a Duel deck's record should be weighed against: the further decks really sit
/// apart, the less a record needs pulling toward the average. The spread beyond what luck explains is the decks' own.
/// </summary>
public static class DuelCushionFitter
{
    public const int MinDeckRounds = 10;

    public const int MinDecks = 200;

    public static IReadOnlyList<DuelCushionFit> Fit(IEnumerable<Duel> duels)
    {
        var caps = duels
            .GroupBy(d => d.Cap)
            .OrderBy(g => g.Key)
            .Select(g => (Cap: g.Key, Spread: Spread.Of(g)))
            .Where(c => c.Spread.Decks >= MinDecks)
            .ToList();
        // Pooled per cap, so decks doing better at one cap than the average deck at another don't count as spread.
        var allCaps = caps.Aggregate(Spread.None, (sum, c) => sum + c.Spread);
        return caps
            .Prepend((Cap: DuelLevelFitter.AllCaps, Spread: allCaps))
            .Where(c => c.Spread.Decks >= MinDecks)
            .Select(c => c.Spread.ToFit(c.Cap))
            .OfType<DuelCushionFit>()
            .ToList();
    }

    private readonly record struct Spread(int Decks, int Rounds, double Excess, double Scale, double Noise)
    {
        public static Spread None => default;

        public static Spread operator +(Spread a, Spread b) => new(
            a.Decks + b.Decks, a.Rounds + b.Rounds, a.Excess + b.Excess, a.Scale + b.Scale, a.Noise + b.Noise);

        public static Spread Of(IEnumerable<Duel> duels)
        {
            var records = new Dictionary<string, (int Wins, int Rounds)>(StringComparer.Ordinal);
            void Add(DuelSide side, bool won)
            {
                var key = string.Join(',', side.Cards.Select(c => c.Id).Order());
                var (wins, rounds) = records.GetValueOrDefault(key);
                records[key] = (wins + (won ? 1 : 0), rounds + 1);
            }
            foreach (var round in duels.SelectMany(d => d.Rounds))
            {
                Add(round.First, round.FirstWon);
                Add(round.Second, !round.FirstWon);
            }

            var decks = records.Values.Where(r => r.Rounds >= MinDeckRounds).ToList();
            var total = decks.Sum(d => d.Rounds);
            if (total == 0)
            {
                return None;
            }
            var average = (double)decks.Sum(d => d.Wins) / total;
            var luck = average * (1 - average);
            var between = decks.Sum(d => d.Rounds * Math.Pow((double)d.Wins / d.Rounds - average, 2));
            var scale = total - decks.Sum(d => (double)d.Rounds * d.Rounds) / total;
            // Between-deck variation is expected at (decks - 1)(luck - variance) + variance * scale, since the average is
            // fitted from the same decks and each deck's own luck is p(1 - p), which averages to luck - variance.
            return new(decks.Count, total, between - (decks.Count - 1) * luck, scale - (decks.Count - 1), total * luck);
        }

        public DuelCushionFit? ToFit(int cap)
        {
            var variance = Excess / Scale;
            if (!(variance > 0))
            {
                return null;
            }
            return new DuelCushionFit(cap, Decks, Rounds, Math.Sqrt(variance), Noise / Rounds / variance - 1);
        }
    }
}
