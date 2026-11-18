using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CardInsightsTests
{
    private static readonly (long, long)[] AllTime = [(0, long.MaxValue)];

    private static CardInsight InsightOf(CardInsightsTallier tallier, int cardId) => tallier.Insights()[0][cardId];

    private static IEnumerable<BattleRecord> Repeat(int count, int[] deck, BattleResult result, string tag)
        => Enumerable.Range(0, count).Select(i => Build.Battle($"{tag}{i}", deck, result));

    private static IEnumerable<BattleRecord> Pairs(int count, int[] deck, int[] against, int wins, string tag)
        => Enumerable.Range(0, count).SelectMany(i =>
        {
            var result = i < wins ? BattleResult.Win : BattleResult.Loss;
            var mine = Build.Battle($"#{tag}A{i}", deck, result);
            var theirs = Build.Battle($"#{tag}B{i}", against, result == BattleResult.Win ? BattleResult.Loss : BattleResult.Win);
            return new[] { mine with { OpponentKey = theirs.Key }, theirs with { OpponentKey = mine.Key } };
        });

    private static CardInsightsTallier Tally(IEnumerable<BattleRecord> battles, Func<int[], string?>? classify = null)
    {
        var tallier = new CardInsightsTallier(AllTime, classify);
        foreach (var battle in battles)
        {
            tallier.Add(battle);
        }
        return tallier;
    }

    [Fact]
    public void Usual_partners_are_the_cards_played_with_it_most_once_they_have_enough_games()
    {
        var tallier = Tally(
            Repeat(150, Build.Eight(1), BattleResult.Win, "#A")
                .Concat(Repeat(50, [1, 20, 21, 22, 23, 24, 25, 26], BattleResult.Loss, "#B")));

        Assert.Equal([2, 3, 4], InsightOf(tallier, 1).UsualPartners);
    }

    private static List<BattleRecord> Games(int[] cards, int games, int wins, string tag, ref int nextFiller)
    {
        var battles = new List<BattleRecord>();
        for (var i = 0; i < games; i++)
        {
            var deck = cards.Concat(Enumerable.Range(nextFiller, 8 - cards.Length)).ToArray();
            nextFiller += 8 - cards.Length;
            battles.Add(Build.Battle($"{tag}{i}", deck, i < wins ? BattleResult.Win : BattleResult.Loss));
        }
        return battles;
    }

    [Fact]
    public void Partners_must_clearly_beat_what_both_cards_win_on_their_own_and_rank_with_few_games_counting_for_less()
    {
        var filler = 10_000;
        var tallier = Tally(
            Games([1, 50], 1_000, 570, "#A", ref filler)
                .Concat(Games([1, 60], 150, 90, "#B", ref filler))
                .Concat(Games([1, 70], 300, 156, "#C", ref filler))
                .Concat(Games([1, 80], 300, 180, "#D", ref filler))
                .Concat(Games([1], 1_000, 379, "#E", ref filler))
                .Concat(Games([50], 3_000, 1_500, "#F", ref filler))
                .Concat(Games([60], 3_000, 1_500, "#G", ref filler))
                .Concat(Games([70], 3_000, 1_500, "#H", ref filler))
                .Concat(Games([80], 3_000, 1_800, "#I", ref filler))
                .ToList());

        var partners = InsightOf(tallier, 1).Partners;

        Assert.Equal([50, 60], partners.Select(p => p.CardId));
        Assert.Equal(0.57 - 2_070.0 / 4_000, partners[0].Lift, 10);
    }

    [Fact]
    public void Deck_styles_keep_the_common_ones_and_group_the_rest()
    {
        var beatdown = Build.Eight(1);
        var cycle = new[] { 1, 30, 31, 32, 33, 34, 35, 36 };
        var rare = new[] { 1, 40, 41, 42, 43, 44, 45, 46 };
        var tallier = Tally(
            Repeat(150, beatdown, BattleResult.Win, "#A")
                .Concat(Repeat(48, cycle, BattleResult.Loss, "#B"))
                .Concat(Repeat(2, rare, BattleResult.Win, "#C")),
            deck => deck[1] switch { 2 => "Beatdown", 30 => "Cycle", _ => "Rare" });

        var styles = InsightOf(tallier, 1).Styles;

        Assert.Equal(["Beatdown", "Cycle", CardInsightsTallier.OtherStyles], styles.Select(s => s.Name));
        Assert.Equal(0.75, styles[0].Share, 10);
        Assert.Equal(1.0, styles[0].WinRate);
        Assert.Null(styles[1].WinRate);
        Assert.Equal(2, styles[2].Games);
    }

    [Fact]
    public void Counters_are_the_opposing_cards_it_wins_least_against()
    {
        var deck = Build.Eight(1);
        var tallier = Tally(
            Pairs(1200, deck, Build.Eight(100), wins: 360, "X")
                .Concat(Pairs(1200, deck, Build.Eight(200), wins: 840, "Y"))
                .Concat(Repeat(1500, Build.Eight(100), BattleResult.Win, "#W"))
                .Concat(Repeat(1500, Build.Eight(100), BattleResult.Loss, "#L")));

        var insight = InsightOf(tallier, 1);

        Assert.Equal(2400, insight.MatchupGames);
        Assert.Equal(0.5, insight.MatchupWinRate!.Value, 10);
        Assert.Equal([100, 101, 102, 103, 104, 105, 106, 107], insight.Counters.Select(c => c.CardId));
        Assert.Equal(0.3, insight.Counters[0].WinRate, 10);
    }

    [Fact]
    public void A_card_is_never_its_own_counter()
    {
        var tallier = Tally(Pairs(2400, Build.Eight(1), [1, 100, 101, 102, 103, 104, 105, 106], wins: 1200, "M"));

        Assert.DoesNotContain(InsightOf(tallier, 1).Counters, c => c.CardId == 1);
        Assert.Equal(4800, InsightOf(tallier, 1).MatchupGames);
    }

    [Fact]
    public void Counters_stay_hidden_until_there_are_enough_matchup_games()
    {
        var tallier = Tally(Pairs(1000, Build.Eight(1), Build.Eight(100), wins: 200, "X"));

        var insight = InsightOf(tallier, 1);

        Assert.Equal(1000, insight.MatchupGames);
        Assert.Empty(insight.Counters);
    }

    [Fact]
    public void Battles_without_a_known_opponent_count_for_partners_but_not_matchups()
    {
        var tallier = Tally(
            Repeat(150, Build.Eight(1), BattleResult.Win, "#A")
                .Concat(Repeat(150, [1, 20, 21, 22, 23, 24, 25, 26], BattleResult.Loss, "#B")));

        var insight = InsightOf(tallier, 1);

        Assert.Equal(0, insight.MatchupGames);
        Assert.Null(insight.MatchupWinRate);
        Assert.NotEmpty(insight.UsualPartners);
    }

    private static CardPeriod Period(long start, long end, int battles) => new(start, end, battles, []);

    [Fact]
    public void Patch_history_skips_small_and_overlapping_periods_and_ends_with_the_current_one()
    {
        var first = Period(0, 100, 20_000);
        var second = Period(100, 200, 20_000);
        var overwritten = Period(150, 200, 15_000);
        var tiny = Period(200, 300, 500);
        var current = Period(300, long.MaxValue, 12_000);

        var history = MetaCache.History([first, second, overwritten, tiny], current);

        Assert.Equal([first, second, current], history);
    }

    [Fact]
    public void Patch_history_keeps_the_latest_six()
    {
        var saved = Enumerable.Range(0, 8).Select(i => Period(i * 100, (i + 1) * 100, 20_000)).ToList();

        var history = MetaCache.History(saved, null);

        Assert.Equal(MetaCache.PatchHistoryLength, history.Count);
        Assert.Equal(saved[^1], history[^1]);
        Assert.Equal(saved[2], history[0]);
    }

    [Fact]
    public void An_older_database_gets_the_opponent_key_column()
    {
        var path = Path.Combine(Path.GetTempPath(), $"schema-{Guid.NewGuid():N}.db");
        try
        {
            var options = new DbContextOptionsBuilder<MetaDbContext>().UseSqlite($"Data Source={path}").Options;
            using (var db = new MetaDbContext(options))
            {
                db.Database.EnsureCreated();
                db.Database.ExecuteSqlRaw("ALTER TABLE battles DROP COLUMN opponent_key;");
            }
            using (var db = new MetaDbContext(options))
            {
                db.EnsureMetaSchema();
                db.EnsureMetaSchema();
                var battle = Build.Battle("#P1", Build.Eight(1), BattleResult.Win) with { OpponentKey = "#P2|key" };
                new BattleRepository(db).MergeBattlesAsync([battle]).GetAwaiter().GetResult();

                Assert.Equal("#P2|key", Assert.Single(new BattleRepository(db).AllBattles()).OpponentKey);
            }
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
        }
    }
}

public sealed class CardInsightsTextTests
{
    private static readonly IReadOnlyList<CatalogCard> Catalog = Enumerable.Range(1, 30).Select(id => Build.CatalogEntry(id)).ToList();

    private static CardStat Stat(int id, int games, double winRate, double playRate, double evoShare = 0)
        => new(id, games, winRate, playRate, evoShare, 0, 0, null, null, null, null, false);

    private static CardStatsResponse Stats(params CardStat[] cards) => new(null, null, 40_000, false, cards);

    private static readonly CardStatsResponse Ranked = Stats(
        Stat(1, 2_000, 0.56, 0.10),
        Stat(2, 2_000, 0.52, 0.30),
        Stat(3, 2_000, 0.50, 0.20),
        Stat(4, 2_000, 0.48, 0.05),
        Stat(5, 500, 0.60, 0.01));

    private static CardInsight Insight(params CardCounter[] counters) => new(
        [2, 3, 4],
        [new(5, 300, 0.15, 0.62, 0.06)],
        [],
        counters,
        counters.Length > 0 ? 5_000 : 0,
        counters.Length > 0 ? 0.56 : null);

    private static CardInsightsResponse InsightsFor(CardStatsResponse stats, CardInsight? insight = null, CatalogCard? card = null)
        => CardInsightsText.Build(card ?? Catalog[0], Catalog, stats, insight, [], [], []);

    [Fact]
    public void The_summary_gives_a_verdict_with_the_rank_among_cards_with_enough_games()
    {
        var summary = InsightsFor(Ranked, Insight()).Summary;

        Assert.Equal(
            "Card1 is a 3-elixir common troop. In Clan War this patch it wins 56.0% of its battles in the top war clans, " +
            "which is among the strongest: #1 of 4 cards by win rate. It's in 10.0% of war decks, #3 by use rate.",
            summary[0]);
        Assert.Equal("It's most often played with Card2, Card3 and Card4.", summary[1]);
    }

    [Fact]
    public void A_card_in_the_lower_half_is_below_average()
    {
        var summary = InsightsFor(Ranked, card: Catalog[2]).Summary;

        Assert.Contains("which is below average: #3 of 4 cards by win rate", summary[0]);
    }

    [Fact]
    public void A_mostly_evolved_card_names_its_partners_in_the_same_sentence()
    {
        var stats = Stats(Stat(1, 2_000, 0.56, 0.10, evoShare: 0.82));

        var summary = InsightsFor(stats, Insight()).Summary;

        Assert.Equal("Most players use its Evolution (82% of games), usually with Card2, Card3 and Card4.", summary[1]);
    }

    [Fact]
    public void A_card_with_too_few_games_isnt_ranked()
    {
        var summary = InsightsFor(Ranked, card: Catalog[4]).Summary;

        Assert.Contains("but with only 500 games that's too few to rank it", summary[0]);
    }

    [Fact]
    public void An_eight_elixir_card_takes_an()
    {
        var summary = InsightsFor(Ranked, card: Catalog[0] with { ElixirCost = 8 }).Summary;

        Assert.StartsWith("Card1 is an 8-elixir common troop", summary[0]);
    }

    [Fact]
    public void Spells_and_buildings_are_named_by_their_id_group_with_the_client_overrides()
    {
        Assert.Equal("spell", CardInsightsText.CardType(28_000_000));
        Assert.Equal("building", CardInsightsText.CardType(27_000_000));
        Assert.Equal("troop", CardInsightsText.CardType(27_000_010));
        Assert.Equal("troop", CardInsightsText.CardType(26_000_000));
    }

    [Fact]
    public void The_crawler_copy_has_the_sections_in_page_order()
    {
        var insights = InsightsFor(Ranked, Insight(new(10, 400, 0.40, -0.12), new(11, 400, 0.42, -0.1), new(12, 400, 0.44, -0.08)));

        var html = SpaContent.Card(Catalog[0], Ranked.Cards[0], true, [], insights, Catalog);

        var order = new[] { "Card1 in Clan War", "Card1 plays well with", "Card1 struggles against" }
            .Select(heading => html.IndexOf(heading, StringComparison.Ordinal))
            .ToList();
        Assert.DoesNotContain(-1, order);
        Assert.Equal(order.Order(), order);
    }
}
