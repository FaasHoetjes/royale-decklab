using System.Runtime.InteropServices;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardPartner(int CardId, int Games, double Share, double WinRate, double Lift);

public sealed record CardStyle(string Name, int Games, double Share, double? WinRate);

public sealed record CardCounter(int CardId, int Games, double WinRate, double Lift);

public sealed record CardInsight(
    IReadOnlyList<int> UsualPartners,
    IReadOnlyList<CardPartner> Partners,
    IReadOnlyList<CardStyle> Styles,
    IReadOnlyList<CardCounter> Counters,
    int MatchupGames,
    double? MatchupWinRate);

public sealed class CardInsightsTallier((long From, long To)[] periods, Func<int[], string?>? classify)
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

    // Lift is measured against the card's own win rate shifted by the other card's edge over 50%, so cards that are
    // strong with or against everything don't count; ranking shrinks it toward that, so few games count for less.
    public const double ClearGapStandardErrors = 2;
    public const int PriorGames = 200;

    public const int MinMatchupGames = 2000;
    public const int MinCounters = 3;

    private readonly Period[] _periods = periods.Select(_ => new Period()).ToArray();
    private readonly Dictionary<int[], string?> _styleOf = new(MetaBuilder.SameCards.Instance);

    public void Add(BattleRecord battle)
    {
        var p = PeriodOf(battle.BattleTimeMs);
        if (p < 0)
        {
            return;
        }
        var period = _periods[p];
        var win = battle.Result.WinShare();
        var style = StyleOf(battle.CardIds);
        foreach (var id in battle.CardIds)
        {
            var card = period.Card(id);
            card.Games++;
            card.Wins += win;
            foreach (var partner in battle.CardIds)
            {
                if (partner != id)
                {
                    card.Partners.Add(partner, win);
                }
            }
            if (style is not null)
            {
                card.Styles.Add(style, win);
            }
        }

        if (battle.OpponentKey is not { } opponentKey)
        {
            return;
        }
        if (period.WaitingForOpponent.Remove(opponentKey, out var other))
        {
            Versus(period, battle.CardIds, win, other.CardIds);
            Versus(period, other.CardIds, other.Win, battle.CardIds);
        }
        else
        {
            period.WaitingForOpponent[battle.Key] = (battle.CardIds, win);
        }
    }

    private static void Versus(Period period, int[] cards, double win, int[] against)
    {
        foreach (var id in cards)
        {
            var card = period.Card(id);
            card.Matchup.Games++;
            card.Matchup.Wins += win;
            foreach (var opposing in against)
            {
                if (opposing != id)
                {
                    card.Versus.Add(opposing, win);
                }
            }
        }
    }

    private string? StyleOf(int[] cardIds)
    {
        if (classify is null)
        {
            return null;
        }
        if (!_styleOf.TryGetValue(cardIds, out var style))
        {
            style = classify(cardIds);
            _styleOf[cardIds] = style;
        }
        return style;
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

    public IReadOnlyDictionary<int, CardInsight>[] Insights()
        => _periods.Select(period =>
        {
            var edge = period.Cards.ToDictionary(kv => kv.Key, kv => kv.Value.Wins / kv.Value.Games - 0.5);
            return (IReadOnlyDictionary<int, CardInsight>)period.Cards.ToDictionary(kv => kv.Key, kv => Insight(kv.Value, edge));
        }).ToArray();

    private static CardInsight Insight(CardCounts card, IReadOnlyDictionary<int, double> edge)
    {
        var usualPartners = card.Partners.Counts
            .Where(kv => kv.Value.Games >= MinPartnerGames)
            .OrderByDescending(kv => kv.Value.Games)
            .ThenBy(kv => kv.Key)
            .Take(UsualPartnerCount)
            .Select(kv => kv.Key)
            .ToList();
        var winRate = card.Wins / card.Games;
        var partners = ClearlyApart(card.Partners, id => winRate + edge[id], MinPartnerGames, above: true)
            .Take(PartnerCount)
            .Select(x => new CardPartner(x.CardId, x.Tally.Games, (double)x.Tally.Games / card.Games, x.Tally.Wins / x.Tally.Games, x.Lift))
            .ToList();

        var styles = new List<CardStyle>();
        var styled = card.Styles.Counts.Sum(kv => kv.Value.Games);
        var shown = card.Styles.Counts
            .Where(kv => (double)kv.Value.Games / card.Games >= MinStyleShare)
            .OrderByDescending(kv => kv.Value.Games)
            .ThenBy(kv => kv.Key, StringComparer.Ordinal)
            .Take(StyleCount)
            .ToList();
        styles.AddRange(shown.Select(kv => Style(kv.Key, kv.Value, card.Games)));
        var rest = new Tally
        {
            Games = styled - shown.Sum(kv => kv.Value.Games),
            Wins = card.Styles.Counts.Sum(kv => kv.Value.Wins) - shown.Sum(kv => kv.Value.Wins),
        };
        if (shown.Count > 0 && rest.Games > 0)
        {
            styles.Add(Style(OtherStyles, rest, card.Games));
        }

        var matchup = card.Matchup;
        double? baseline = matchup.Games > 0 ? matchup.Wins / matchup.Games : null;
        var counters = new List<CardCounter>();
        if (baseline is { } b && matchup.Games >= MinMatchupGames)
        {
            counters = ClearlyApart(card.Versus, id => b - edge[id], MinCounterGames, above: false)
                .Take(CounterCount)
                .Select(x => new CardCounter(x.CardId, x.Tally.Games, x.Tally.Wins / x.Tally.Games, x.Lift))
                .ToList();
            if (counters.Count < MinCounters)
            {
                counters = [];
            }
        }

        return new CardInsight(usualPartners, partners, styles, counters, matchup.Games, baseline);
    }

    private static IEnumerable<(int CardId, Tally Tally, double Lift)> ClearlyApart(
        Tallies<int> tallies, Func<int, double> expectedWinRate, int minGames, bool above)
    {
        var sign = above ? 1 : -1;
        return tallies.Counts
            .Where(kv => kv.Value.Games >= minGames)
            .Select(kv =>
            {
                var (games, wins) = (kv.Value.Games, kv.Value.Wins);
                var expected = Math.Clamp(expectedWinRate(kv.Key), 0.01, 0.99);
                var standardError = Math.Sqrt(expected * (1 - expected) / games);
                var lift = wins / games - expected;
                var shrunkLift = (wins + PriorGames * expected) / (games + PriorGames) - expected;
                return (kv.Key, kv.Value, Lift: lift, Clear: sign * lift > ClearGapStandardErrors * standardError, Rank: sign * shrunkLift);
            })
            .Where(x => x.Clear)
            .OrderByDescending(x => x.Rank)
            .ThenBy(x => x.Key)
            .Select(x => (x.Key, x.Value, x.Lift));
    }

    private static CardStyle Style(string name, Tally tally, int cardGames)
        => new(name, tally.Games, (double)tally.Games / cardGames,
            tally.Games >= MinStyleGamesForWinRate ? tally.Wins / tally.Games : null);

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

    private sealed class Period
    {
        public Dictionary<int, CardCounts> Cards { get; } = [];
        public Dictionary<string, (int[] CardIds, double Win)> WaitingForOpponent { get; } = new(StringComparer.Ordinal);

        public CardCounts Card(int id)
        {
            ref var card = ref CollectionsMarshal.GetValueRefOrAddDefault(Cards, id, out _);
            return card ??= new CardCounts();
        }
    }

    private sealed class CardCounts
    {
        public int Games;
        public double Wins;
        public Tally Matchup;
        public Tallies<int> Partners { get; } = new();
        public Tallies<int> Versus { get; } = new();
        public Tallies<string> Styles { get; } = new();
    }

    private struct Tally
    {
        public int Games;
        public double Wins;
    }

    private sealed class Tallies<TKey> where TKey : notnull
    {
        public Dictionary<TKey, Tally> Counts { get; } = [];

        public void Add(TKey key, double win)
        {
            ref var tally = ref CollectionsMarshal.GetValueRefOrAddDefault(Counts, key, out _);
            tally.Games++;
            tally.Wins += win;
        }
    }
}
