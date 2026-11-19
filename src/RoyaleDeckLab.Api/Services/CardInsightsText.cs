using System.Globalization;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardPatchPoint(string? Since, string? Until, int Games, double WinRate, double PlayRate);

public sealed record CardInsightsResponse(
    IReadOnlyList<string> Summary,
    IReadOnlyList<CardStyle> Styles,
    IReadOnlyList<CardPartner> Partners,
    IReadOnlyList<CardCounter> Counters,
    double? MatchupWinRate,
    double? WinRate,
    IReadOnlyList<CardPatchPoint> History);

public static class CardInsightsText
{
    // Mirrors isLowSample in client/src/lib/cardStats.ts.
    private const double MaxWinRateMargin = 0.026;
    public static readonly int MinReliableGames = (int)Math.Ceiling(1 / (MaxWinRateMargin * MaxWinRateMargin));
    private const int MinCardsForVerdict = 4;

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
        var deckNames = DeckArchetypes.DistinctNames(decks);
        var usualPartners = (insight?.UsualPartners ?? []).Where(names.ContainsKey).ToList();
        var text = new Writer(card, names, stats, stat, usualPartners, decks, deckNames, updates);
        return new CardInsightsResponse(
            text.Summary(),
            styles,
            partners,
            counters,
            counters.Count > 0 ? insight?.MatchupWinRate : null,
            insight?.WinRate,
            History(card.Id, history));
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

    private sealed class Writer(
        CatalogCard card,
        IReadOnlyDictionary<int, string> names,
        CardStatsResponse stats,
        CardStat? stat,
        IReadOnlyList<int> usualPartners,
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
                return [$"{Describe()}."];
            }
            var (winRank, playRank, rankedCount) = Ranks(stats.Cards, card.Id);
            var winRate = $"In Clan War {_period} it wins {Pct(stat.WinRate)} of its battles in the top war clans";
            var performance = new List<string>
            {
                $"{Describe()}.",
                winRank is { } rank
                    ? rankedCount >= MinCardsForVerdict
                        ? $"{winRate}, which is {Verdict(rank, rankedCount)}: #{rank} of {rankedCount} cards by win rate."
                        : $"{winRate}: #{rank} of {rankedCount} cards by win rate."
                    : $"{winRate}, but with only {Count(stat.Games)} games that's too few to rank it.",
                $"It's in {Pct(stat.PlayRate)} of war decks, #{playRank} by use rate.",
            };
            if (stat.WinRateChange is { } change)
            {
                performance.Add(stat.ChangeIsClear
                    ? $"Its win rate is {(change > 0 ? "up" : "down")} {Points(change)} points since the last patch."
                    : "Its win rate hasn't clearly moved since the last patch.");
            }
            if (BalanceSentence() is { } balance)
            {
                performance.Add(balance);
            }

            var second = new List<string>();
            var partnerNames = usualPartners.Count == CardInsightsTallier.UsualPartnerCount
                ? List(usualPartners.Select(id => names[id]))
                : null;
            var versions = VersionsSentence();
            if (versions is { Majority: true } && partnerNames is not null)
            {
                second.Add($"{versions.Value.Text}, usually with {partnerNames}.");
            }
            else
            {
                if (versions is { } v)
                {
                    second.Add($"{v.Text}.");
                }
                if (partnerNames is not null)
                {
                    second.Add($"It's most often played with {partnerNames}.");
                }
            }
            if (decks.Count > 0)
            {
                second.Add($"The top-ranked deck with it right now is {deckNames[0].Replace(" · ", " with ", StringComparison.Ordinal)}.");
            }
            var first = string.Join(" ", performance);
            return second.Count > 0 ? [first, string.Join(" ", second)] : [first];
        }

        private static string Verdict(int rank, int rankedCount) => ((double)rank / rankedCount) switch
        {
            <= 0.25 => "among the strongest",
            <= 0.5 => "above average",
            <= 0.75 => "below average",
            _ => "among the weakest",
        };

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

        private (string Text, bool Majority)? VersionsSentence()
        {
            if (_isChampion || stat is null)
            {
                return null;
            }
            if (stat.EvoShare >= 0.5 && stat.HeroShare == 0)
            {
                return ($"Most players use its Evolution ({Pct(stat.EvoShare, 0)} of games)", true);
            }
            if (stat.HeroShare >= 0.5 && stat.EvoShare == 0)
            {
                return ($"Most players use its Hero ({Pct(stat.HeroShare, 0)} of games)", true);
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
            return parts.Count == 0 ? null : (string.Join(" and ", parts), false);
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

    internal static string List(IEnumerable<string> items)
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
