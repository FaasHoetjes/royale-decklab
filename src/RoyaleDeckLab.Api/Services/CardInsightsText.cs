using System.Globalization;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardPatchPoint(string? Since, string? Until, int Games, double WinRate, double PlayRate);

public sealed record CardFaqItem(string Question, string Answer);

public sealed record CardInsightsResponse(
    IReadOnlyList<string> Summary,
    IReadOnlyList<CardStyle> Styles,
    IReadOnlyList<CardPartner> Partners,
    IReadOnlyList<CardCounter> Counters,
    double? MatchupWinRate,
    IReadOnlyList<CardPatchPoint> History,
    IReadOnlyList<CardFaqItem> Faq);

public static class CardInsightsText
{
    // Mirrors isLowSample in client/src/lib/cardStats.ts.
    private const double MaxWinRateMargin = 0.026;
    public static readonly int MinReliableGames = (int)Math.Ceiling(1 / (MaxWinRateMargin * MaxWinRateMargin));

    private const int SummaryPartners = 3;

    // Mirrors TROOP_OVERRIDES in client/src/lib/cardInfo.ts.
    private static readonly HashSet<int> TroopOverrides = [27000010, 28000016, 28000025];

    public static CardInsightsResponse Build(
        CatalogCard card,
        IReadOnlyList<CatalogCard> catalog,
        CardStatsResponse stats,
        CardInsight? insight,
        IReadOnlyList<CardPeriod> history,
        IReadOnlyList<BestDeckEntry> decks,
        IReadOnlyList<BalanceUpdate> updates)
    {
        var names = catalog.ToDictionary(c => c.Id, c => c.Name);
        var partners = (insight?.Partners ?? []).Where(p => names.ContainsKey(p.CardId)).ToList();
        var counters = (insight?.Counters ?? []).Where(c => names.ContainsKey(c.CardId)).ToList();
        var styles = insight?.Styles ?? [];
        var stat = stats.Cards.FirstOrDefault(s => s.Id == card.Id);
        var deckNames = DeckNames(decks);
        var text = new Writer(card, names, stats, stat, partners, counters, styles, decks, deckNames, updates);
        return new CardInsightsResponse(
            text.Summary(),
            styles,
            partners,
            counters,
            counters.Count > 0 ? insight?.MatchupWinRate : null,
            History(card.Id, history),
            text.Faq());
    }

    private static List<CardPatchPoint> History(int cardId, IReadOnlyList<CardPeriod> periods)
    {
        var points = new List<CardPatchPoint>();
        foreach (var period in periods)
        {
            if (period.Cards.FirstOrDefault(c => c.CardId == cardId) is not { Games: > 0 } tally)
            {
                continue;
            }
            points.Add(new CardPatchPoint(
                period.StartMs > 0 ? MetaCache.IsoMs(period.StartMs) : null,
                period.EndMs == long.MaxValue ? null : MetaCache.IsoMs(period.EndMs),
                tally.Games,
                tally.Wins / tally.Games,
                (double)tally.Games / period.Battles));
        }
        return points;
    }

    // Mirrors cardRanks in client/src/lib/cardStats.ts.
    public static (int? WinRank, int PlayRank, int RankedCount) Ranks(IReadOnlyList<CardStat> stats, int cardId)
    {
        var playRank = stats.OrderByDescending(s => s.PlayRate).Select(s => s.Id).ToList().IndexOf(cardId) + 1;
        var ranked = stats.Where(s => s.Games >= MinReliableGames).OrderByDescending(s => s.WinRate).Select(s => s.Id).ToList();
        var winRank = ranked.IndexOf(cardId) + 1;
        return (winRank > 0 ? winRank : null, playRank, ranked.Count);
    }

    private static IReadOnlyList<string> DeckNames(IReadOnlyList<BestDeckEntry> decks)
        => DeckArchetypes.DistinctNames(decks
            .Select(d => (IReadOnlyList<(string, int?)>)d.Cards.Select(c => (c.Name, c.ElixirCost)).ToList())
            .ToList());

    private sealed class Writer(
        CatalogCard card,
        IReadOnlyDictionary<int, string> names,
        CardStatsResponse stats,
        CardStat? stat,
        IReadOnlyList<CardPartner> partners,
        IReadOnlyList<CardCounter> counters,
        IReadOnlyList<CardStyle> styles,
        IReadOnlyList<BestDeckEntry> decks,
        IReadOnlyList<string> deckNames,
        IReadOnlyList<BalanceUpdate> updates)
    {
        private readonly string _name = card.Name;
        private readonly string _period = stats.IsLastPatch ? "last patch" : "this patch";
        private readonly bool _isChampion = RarityExtensions.IsChampion(card.Rarity);

        public List<string> Summary()
        {
            if (stat is null)
            {
                return [$"{Describe()}. Nobody in the top war clans has played it in a war battle {_period}."];
            }
            var (winRank, playRank, rankedCount) = Ranks(stats.Cards, card.Id);
            var first = $"{Describe()} that wins {Pct(stat.WinRate)} of its Clan War battles in the top war clans {_period}";
            first += winRank is { } rank
                ? $", #{rank} of {rankedCount} cards by win rate."
                : $". With only {Count(stat.Games)} games, that's too few to rank it by win rate.";
            first += $" It's in {Pct(stat.PlayRate)} of war decks, the #{playRank} most played card.";

            var second = new List<string>();
            if (stat.WinRateChange is { } change)
            {
                second.Add(stat.ChangeIsClear
                    ? $"Its win rate is {(change > 0 ? "up" : "down")} {Points(change)} points since the last patch."
                    : "Its win rate hasn't clearly moved since the last patch.");
            }
            if (BalanceSentence() is { } balance)
            {
                second.Add(balance);
            }
            if (VersionsSentence() is { } versions)
            {
                second.Add(versions);
            }
            if (partners.Count >= SummaryPartners)
            {
                second.Add($"It's most often played with {List(partners.Take(SummaryPartners).Select(p => names[p.CardId]))}.");
            }
            if (decks.Count > 0)
            {
                second.Add($"The best war deck with it right now is {deckNames[0]}, with a {Pct(decks[0].WinRate)} win rate over {Count(decks[0].Uses)} games.");
            }
            return second.Count > 0 ? [first, string.Join(" ", second)] : [first];
        }

        public List<CardFaqItem> Faq()
        {
            var faq = new List<CardFaqItem>();
            if (decks.Count > 0)
            {
                var best = decks[0];
                var answer = $"{deckNames[0]} ({string.Join(", ", best.Cards.Select(c => c.Name))}) has the best record in Clan War right now: " +
                             $"a {Pct(best.WinRate)} win rate over {Count(best.Uses)} games.";
                var mostPlayed = Enumerable.Range(0, decks.Count).MaxBy(i => decks[i].Uses);
                if (mostPlayed != 0)
                {
                    answer += $" Of the top {_name} decks, {deckNames[mostPlayed]} is played most: {Pct(decks[mostPlayed].WinRate)} over {Count(decks[mostPlayed].Uses)} games.";
                }
                faq.Add(new($"What is the best {_name} deck in Clash Royale right now?", answer));
            }

            if (stat is not null && Ranks(stats.Cards, card.Id) is { WinRank: { } winRank } ranks)
            {
                var place = (double)winRank / ranks.RankedCount;
                var verdict = place <= 0.25 ? "Yes. " : place > 0.75 ? "Not on its own. " : "It's about average. ";
                var answer = $"{verdict}{_name} wins {Pct(stat.WinRate)} of its war battles, #{winRank} of {ranks.RankedCount} cards, " +
                             $"and is in {Pct(stat.PlayRate)} of war decks, the #{ranks.PlayRank} most played.";
                var rated = styles.Where(s => s.WinRate is not null && s.Name != CardInsightsTallier.OtherStyles).ToList();
                if (rated.Count >= 2)
                {
                    var bestStyle = rated.MaxBy(s => s.WinRate)!;
                    answer += $" It does best in {bestStyle.Name} decks, at {Pct(bestStyle.WinRate!.Value)}.";
                }
                faq.Add(new($"Is {_name} good in Clan War?", answer));
            }

            if (partners.Count >= SummaryPartners)
            {
                var top = partners.Take(SummaryPartners).Select(p => $"{names[p.CardId]} (in {Pct(p.Share, 0)} of its games)");
                var answer = $"The cards most often played with {_name} in Clan War are {List(top)}.";
                var bestPartner = partners.MaxBy(p => p.WinRate)!;
                if (stat is not null && bestPartner.WinRate > stat.WinRate)
                {
                    answer += $" Decks that also run {names[bestPartner.CardId]} win most often, at {Pct(bestPartner.WinRate)}.";
                }
                faq.Add(new($"What cards go well with {_name}?", answer));
            }

            if (counters.Count > 0)
            {
                var worst = counters.Take(SummaryPartners).Select(c => $"{names[c.CardId]} ({Pct(c.WinRate)})");
                faq.Add(new($"What counters {_name}?",
                    $"In Clan War, {_name} wins least often against {List(worst)}."));
            }

            if (!_isChampion && stat is { NormalWinRate: { } normal })
            {
                if (stat.EvoWinRate is { } evo)
                {
                    faq.Add(new($"Should I use the {_name} Evolution?",
                        $"{Pct(stat.EvoShare, 0)} of {_name} war games use it. The Evolution wins {Pct(evo)} of its war battles, against {Pct(normal)} for the normal card."));
                }
                if (stat.HeroWinRate is { } hero)
                {
                    faq.Add(new($"Should I use the {_name} Hero?",
                        $"{Pct(stat.HeroShare, 0)} of {_name} war games use it. The Hero wins {Pct(hero)} of its war battles, against {Pct(normal)} for the normal card."));
                }
            }
            return faq;
        }

        private string Describe()
        {
            var rarity = card.Rarity is { Length: > 0 } r ? r.ToLowerInvariant() : null;
            var kind = _isChampion ? null : CardType(card.Id);
            var words = new[] { card.ElixirCost is { } cost ? $"{cost}-elixir" : null, rarity, kind }.OfType<string>().ToList();
            return words.Count == 0 ? $"{_name} is a card" : $"{_name} is {Article(words[0])} {string.Join(" ", words)}";
        }

        private string? BalanceSentence()
        {
            foreach (var update in updates.OrderByDescending(u => u.LiveFrom))
            {
                var changes = update.Changes.Where(c => c.CardId == card.Id).ToList();
                if (changes.Count == 0)
                {
                    continue;
                }
                var parts = changes.Select(c => c.Version switch
                {
                    CardVersionKind.Evo => $"its Evolution was {Verb(c.Kind)}",
                    CardVersionKind.Hero when !_isChampion => $"its Hero was {Verb(c.Kind)}",
                    _ => $"it was {Verb(c.Kind)}",
                }).Distinct();
                return $"In the {update.LiveFrom.ToString("MMMM d", CultureInfo.InvariantCulture)} balance update, {List(parts)}.";
            }
            return null;
        }

        private string? VersionsSentence()
        {
            if (_isChampion || stat is null)
            {
                return null;
            }
            var parts = new List<string>();
            if (stat.EvoShare > 0)
            {
                parts.Add($"{Pct(stat.EvoShare, 0)} of its games use the Evolution");
            }
            if (stat.HeroShare > 0)
            {
                parts.Add($"{Pct(stat.HeroShare, 0)} the Hero");
            }
            return parts.Count == 0 ? null : string.Join(" and ", parts) + ".";
        }
    }

    public static string CardType(int id)
    {
        if (TroopOverrides.Contains(id))
        {
            return "troop";
        }
        return (id / 1_000_000) switch
        {
            27 => "building",
            28 => "spell",
            _ => "troop",
        };
    }

    private static string Verb(BalanceChangeKind kind) => kind switch
    {
        BalanceChangeKind.Buff => "buffed",
        BalanceChangeKind.Nerf => "nerfed",
        _ => "reworked",
    };

    private static string Article(string word)
        => word.StartsWith('8') || word.StartsWith("11", StringComparison.Ordinal) || word.StartsWith("18", StringComparison.Ordinal) || "aeiou".Contains(word[0])
            ? "an"
            : "a";

    private static string List(IEnumerable<string> items)
    {
        var list = items.ToList();
        return list.Count switch
        {
            0 => "",
            1 => list[0],
            _ => string.Join(", ", list[..^1]) + " and " + list[^1],
        };
    }

    private static string Pct(double share, int digits = 1)
        => (share * 100).ToString(digits == 0 ? "0" : "0.0", CultureInfo.InvariantCulture) + "%";

    private static string Points(double change) => Math.Abs(change * 100).ToString("0.0", CultureInfo.InvariantCulture);

    private static string Count(int n) => n.ToString("N0", CultureInfo.InvariantCulture);
}
