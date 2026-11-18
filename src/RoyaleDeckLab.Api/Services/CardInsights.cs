using System.Runtime.InteropServices;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardPartner(int CardId, int Games, double Share, double WinRate);

public sealed record CardStyle(string Name, int Games, double Share, double? WinRate);

public sealed record CardCounter(int CardId, int Games, double WinRate);

public sealed record CardInsight(
    IReadOnlyList<CardPartner> Partners,
    IReadOnlyList<CardStyle> Styles,
    IReadOnlyList<CardCounter> Counters,
    int MatchupGames,
    double? MatchupWinRate);

public sealed class CardInsightsTallier((long From, long To)[] periods, Func<int[], string?>? classify)
{
    public const int PartnerCount = 6;
    public const int MinPartnerGames = 100;

    public const int StyleCount = 4;
    public const double MinStyleShare = 0.03;
    public const int MinStyleGamesForWinRate = 100;
    public const string OtherStyles = "Other decks";

    public const int CounterCount = 6;
    public const int MinCounterGames = 200;

    // Counters rank on a win rate shrunk toward the card's own, so rarely met cards need a bigger gap.
    public const int CounterPriorGames = 200;

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
        => _periods.Select(period => (IReadOnlyDictionary<int, CardInsight>)period.Cards.ToDictionary(kv => kv.Key, kv => Insight(kv.Value))).ToArray();

    private static CardInsight Insight(CardCounts card)
    {
        var partners = card.Partners.Counts
            .Where(kv => kv.Value.Games >= MinPartnerGames)
            .OrderByDescending(kv => kv.Value.Games)
            .ThenBy(kv => kv.Key)
            .Take(PartnerCount)
            .Select(kv => new CardPartner(kv.Key, kv.Value.Games, (double)kv.Value.Games / card.Games, kv.Value.Wins / kv.Value.Games))
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
            counters = card.Versus.Counts
                .Where(kv => kv.Value.Games >= MinCounterGames)
                .Select(kv => (kv.Key, kv.Value, Pulled: (kv.Value.Wins + CounterPriorGames * b) / (kv.Value.Games + CounterPriorGames)))
                .Where(x => x.Pulled < b)
                .OrderBy(x => x.Pulled)
                .ThenBy(x => x.Key)
                .Take(CounterCount)
                .Select(x => new CardCounter(x.Key, x.Value.Games, x.Value.Wins / x.Value.Games))
                .ToList();
            if (counters.Count < MinCounters)
            {
                counters = [];
            }
        }

        return new CardInsight(partners, styles, counters, matchup.Games, baseline);
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
