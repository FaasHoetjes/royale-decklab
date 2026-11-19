using System.Runtime.InteropServices;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardPartner(int CardId, int Games, double Share, double WinRate, double Lift);

public sealed record CardStyle(string Name, int Games, double Share, double? WinRate, bool IsClear);

public sealed record CardCounter(int CardId, int Games, double WinRate, double Lift);

public sealed record CardInsight(
    IReadOnlyList<int> UsualPartners,
    IReadOnlyList<CardPartner> Partners,
    IReadOnlyList<CardStyle> Styles,
    IReadOnlyList<CardCounter> Counters,
    int MatchupGames,
    double? MatchupWinRate,
    double WinRate);

public sealed class CardInsightsTallier((long From, long To)[] periods)
{
    public const int PartnerCount = 12;
    public const int UsualPartnerCount = 3;
    public const int MinPartnerGames = 100;

    public const int StyleCount = 4;
    public const double MinStyleShare = 0.03;
    public const int MinStyleGamesForWinRate = 100;
    public const string OtherStyles = "Other decks";

    public const int CounterCount = 12;
    public const int MinCounterGames = 200;

    // Lift is measured against what each card wins in its games without the other, so cards that are strong with or
    // against everything don't count, and a pair's own games don't pull the expectation toward its result.
    public const double ClearGapStandardErrors = 2;
    public const int PriorGames = 200;
    public const int MinGamesApart = 100;

    public const int MinMatchupGames = 2000;
    public const int MinCounters = 3;

    private const int InitialCapacity = 256;

    private readonly Dictionary<int, int> _indexOf = [];
    private readonly List<int> _ids = [];
    private int _capacity = InitialCapacity;
    private readonly Period[] _periods = periods.Select(_ => new Period(InitialCapacity)).ToArray();

    public void Add(BattleRecord battle)
    {
        var p = PeriodOf(battle.BattleTimeMs);
        if (p < 0)
        {
            return;
        }
        var cards = Indices(battle.CardIds);
        var period = _periods[p];
        var win = battle.Result.WinShare();
        period.AddDeck(battle.CardIds, win);
        foreach (var i in cards)
        {
            period.Games[i]++;
            period.Wins[i] += win;
            var row = i * _capacity;
            foreach (var j in cards)
            {
                if (j != i)
                {
                    period.PartnerGames[row + j]++;
                    period.PartnerWins[row + j] += win;
                }
            }
        }

        if (battle.OpponentKey is not { } opponentKey)
        {
            return;
        }
        if (period.WaitingForOpponent.Remove(opponentKey, out var other))
        {
            Versus(period, cards, win, other.Cards);
            Versus(period, other.Cards, other.Win, cards);
        }
        else
        {
            period.WaitingForOpponent[battle.Key] = (cards, win);
        }
    }

    private int[] Indices(int[] cardIds)
    {
        var indices = new int[cardIds.Length];
        for (var k = 0; k < cardIds.Length; k++)
        {
            if (!_indexOf.TryGetValue(cardIds[k], out var index))
            {
                index = _ids.Count;
                _indexOf[cardIds[k]] = index;
                _ids.Add(cardIds[k]);
                if (index >= _capacity)
                {
                    Grow();
                }
            }
            indices[k] = index;
        }
        return indices;
    }

    private void Grow()
    {
        var capacity = _capacity * 2;
        foreach (var period in _periods)
        {
            period.Grow(_capacity, capacity);
        }
        _capacity = capacity;
    }

    private void Versus(Period period, int[] cards, double win, int[] against)
    {
        foreach (var i in cards)
        {
            period.MatchupGames[i]++;
            period.MatchupWins[i] += win;
            var row = i * _capacity;
            foreach (var j in against)
            {
                if (j != i)
                {
                    period.VersusGames[row + j]++;
                    period.VersusWins[row + j] += win;
                }
            }
        }
    }

    private int PeriodOf(long battleTimeMs)
    {
        for (var p = 0; p < periods.Length; p++)
        {
            if (battleTimeMs >= periods[p].From && battleTimeMs < periods[p].To)
            {
                return p;
            }
        }
        return -1;
    }

    public IReadOnlyDictionary<int, CardInsight>[] Insights(Func<int[], string?>? classify = null)
    {
        var styleOf = new Dictionary<int[], string?>(MetaBuilder.SameCards.Instance);
        return _periods.Select(period =>
        {
            var styles = classify is null ? null : StylesByCard(period, deck =>
            {
                if (!styleOf.TryGetValue(deck, out var style))
                {
                    style = classify(deck);
                    styleOf[deck] = style;
                }
                return style;
            });
            var insights = new Dictionary<int, CardInsight>();
            for (var i = 0; i < _ids.Count; i++)
            {
                if (period.Games[i] > 0)
                {
                    insights[_ids[i]] = Insight(period, i, styles?.GetValueOrDefault(i));
                }
            }
            return (IReadOnlyDictionary<int, CardInsight>)insights;
        }).ToArray();
    }

    private Dictionary<int, Dictionary<string, Tally>> StylesByCard(Period period, Func<int[], string?> styleOf)
    {
        var byCard = new Dictionary<int, Dictionary<string, Tally>>();
        foreach (var (deck, tally) in period.Decks)
        {
            if (styleOf(deck) is not { } style)
            {
                continue;
            }
            foreach (var id in deck)
            {
                var index = _indexOf[id];
                if (!byCard.TryGetValue(index, out var styles))
                {
                    styles = new Dictionary<string, Tally>(StringComparer.Ordinal);
                    byCard[index] = styles;
                }
                var sum = styles.GetValueOrDefault(style);
                styles[style] = new Tally { Games = sum.Games + tally.Games, Wins = sum.Wins + tally.Wins };
            }
        }
        return byCard;
    }

    private CardInsight Insight(Period period, int card, Dictionary<string, Tally>? styleTallies)
    {
        var games = period.Games[card];
        var wins = period.Wins[card];
        var winRate = wins / games;
        var row = card * _capacity;

        var usualPartners = Enumerable.Range(0, _ids.Count)
            .Where(j => period.PartnerGames[row + j] >= MinPartnerGames)
            .OrderByDescending(j => period.PartnerGames[row + j])
            .ThenBy(j => _ids[j])
            .Take(UsualPartnerCount)
            .Select(j => _ids[j])
            .ToList();

        var partners = ClearlyApart(period.PartnerGames, period.PartnerWins, row, MinPartnerGames, above: true, (j, together) =>
            {
                var otherRate = RateApart(period.Games[j], period.Wins[j], together);
                return RateApart(games, wins, together) is { } own ? own + (otherRate ?? 0.5) - 0.5 : null;
            })
            .Take(PartnerCount)
            .Select(x => new CardPartner(_ids[x.Index], x.Tally.Games, (double)x.Tally.Games / games, x.Tally.Wins / x.Tally.Games, x.Lift))
            .ToList();

        var styles = Styles(styleTallies, games, winRate);

        var matchupGames = period.MatchupGames[card];
        var matchupWins = period.MatchupWins[card];
        double? baseline = matchupGames > 0 ? matchupWins / matchupGames : null;
        var counters = new List<CardCounter>();
        if (matchupGames >= MinMatchupGames)
        {
            counters = ClearlyApart(period.VersusGames, period.VersusWins, row, MinCounterGames, above: false, (j, against) =>
                {
                    var theirs = new Tally { Games = period.VersusGames[j * _capacity + card], Wins = period.VersusWins[j * _capacity + card] };
                    var otherRate = RateApart(period.Games[j], period.Wins[j], theirs);
                    return RateApart(matchupGames, matchupWins, against) is { } own ? own - (otherRate ?? 0.5) + 0.5 : null;
                })
                .Take(CounterCount)
                .Select(x => new CardCounter(_ids[x.Index], x.Tally.Games, x.Tally.Wins / x.Tally.Games, x.Lift))
                .ToList();
            if (counters.Count < MinCounters)
            {
                counters = [];
            }
        }

        return new CardInsight(usualPartners, partners, styles, counters, matchupGames, baseline, winRate);
    }

    private static double? RateApart(int games, double wins, Tally shared)
        => games - shared.Games >= MinGamesApart ? (wins - shared.Wins) / (games - shared.Games) : null;

    private IEnumerable<(int Index, Tally Tally, double Lift)> ClearlyApart(
        int[] gameCounts, double[] winCounts, int row, int minGames, bool above, Func<int, Tally, double?> expectedWinRate)
    {
        var sign = above ? 1 : -1;
        var found = new List<(int Index, Tally Tally, double Lift, double Rank)>();
        for (var j = 0; j < _ids.Count; j++)
        {
            var tally = new Tally { Games = gameCounts[row + j], Wins = winCounts[row + j] };
            if (tally.Games < minGames || expectedWinRate(j, tally) is not { } rawExpected)
            {
                continue;
            }
            var expected = Math.Clamp(rawExpected, 0.01, 0.99);
            var lift = tally.Wins / tally.Games - expected;
            if (sign * lift <= ClearGapStandardErrors * StandardError(expected, tally.Games))
            {
                continue;
            }
            var shrunkLift = (tally.Wins + PriorGames * expected) / (tally.Games + PriorGames) - expected;
            found.Add((j, tally, lift, sign * shrunkLift));
        }
        return found
            .OrderByDescending(x => x.Rank)
            .ThenBy(x => _ids[x.Index])
            .Select(x => (x.Index, x.Tally, x.Lift));
    }

    private static double StandardError(double rate, int games) => Math.Sqrt(rate * (1 - rate) / games);

    private static List<CardStyle> Styles(Dictionary<string, Tally>? tallies, int cardGames, double cardWinRate)
    {
        if (tallies is null)
        {
            return [];
        }
        var shown = tallies
            .Where(kv => (double)kv.Value.Games / cardGames >= MinStyleShare)
            .OrderByDescending(kv => kv.Value.Games)
            .ThenBy(kv => kv.Key, StringComparer.Ordinal)
            .Take(StyleCount)
            .ToList();
        var styles = shown.Select(kv => Style(kv.Key, kv.Value, cardGames, cardWinRate)).ToList();
        var rest = new Tally
        {
            Games = tallies.Values.Sum(t => t.Games) - shown.Sum(kv => kv.Value.Games),
            Wins = tallies.Values.Sum(t => t.Wins) - shown.Sum(kv => kv.Value.Wins),
        };
        if (shown.Count > 0 && rest.Games > 0)
        {
            styles.Add(Style(OtherStyles, rest, cardGames, cardWinRate));
        }
        return styles;
    }

    private static CardStyle Style(string name, Tally tally, int cardGames, double cardWinRate)
    {
        if (tally.Games < MinStyleGamesForWinRate)
        {
            return new(name, tally.Games, (double)tally.Games / cardGames, null, false);
        }
        var winRate = tally.Wins / tally.Games;
        var expected = Math.Clamp(cardWinRate, 0.01, 0.99);
        var isClear = Math.Abs(winRate - cardWinRate) > ClearGapStandardErrors * StandardError(expected, tally.Games);
        return new(name, tally.Games, (double)tally.Games / cardGames, winRate, isClear);
    }

    public static Func<int[], string?> Classifier(IReadOnlyList<CatalogCard> catalog)
    {
        var byId = catalog.ToDictionary(c => c.Id);
        return cardIds =>
        {
            var cards = new List<(string Name, int? ElixirCost)>(cardIds.Length);
            foreach (var id in cardIds)
            {
                if (!byId.TryGetValue(id, out var card))
                {
                    return null;
                }
                cards.Add((card.Name, card.ElixirCost));
            }
            return DeckArchetypes.Classify(cards).Name;
        };
    }

    private sealed class Period(int capacity)
    {
        public int[] Games = new int[capacity];
        public double[] Wins = new double[capacity];
        public int[] MatchupGames = new int[capacity];
        public double[] MatchupWins = new double[capacity];
        public int[] PartnerGames = new int[capacity * capacity];
        public double[] PartnerWins = new double[capacity * capacity];
        public int[] VersusGames = new int[capacity * capacity];
        public double[] VersusWins = new double[capacity * capacity];

        public Dictionary<int[], Tally> Decks { get; } = new(MetaBuilder.SameCards.Instance);
        public Dictionary<string, (int[] Cards, double Win)> WaitingForOpponent { get; } = new(StringComparer.Ordinal);

        public void AddDeck(int[] cardIds, double win)
        {
            ref var tally = ref CollectionsMarshal.GetValueRefOrAddDefault(Decks, cardIds, out _);
            tally.Games++;
            tally.Wins += win;
        }

        public void Grow(int from, int to)
        {
            Array.Resize(ref Games, to);
            Array.Resize(ref Wins, to);
            Array.Resize(ref MatchupGames, to);
            Array.Resize(ref MatchupWins, to);
            PartnerGames = Square(PartnerGames, from, to);
            PartnerWins = Square(PartnerWins, from, to);
            VersusGames = Square(VersusGames, from, to);
            VersusWins = Square(VersusWins, from, to);
        }

        private static T[] Square<T>(T[] counts, int from, int to)
        {
            var grown = new T[to * to];
            for (var row = 0; row < from; row++)
            {
                Array.Copy(counts, row * from, grown, row * to, from);
            }
            return grown;
        }
    }

    private struct Tally
    {
        public int Games;
        public double Wins;
    }
}
