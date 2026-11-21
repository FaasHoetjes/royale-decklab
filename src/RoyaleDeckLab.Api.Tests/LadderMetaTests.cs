using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LadderMetaTests : IDisposable
{
    private static readonly long Now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private readonly string _metaPath = Path.Combine(Path.GetTempPath(), $"ladder-meta-{Guid.NewGuid():N}.db");
    private readonly TestLadder _ladder = new();
    private readonly ServiceProvider _services;

    public LadderMetaTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_metaPath}"));
        services.AddScoped<BattleRepository>();
        services.AddScoped(sp => new MetaBuilder(null!, null!, sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MetaOptions>>(),
            NullLogger<MetaBuilder>.Instance));
        services.AddLogging();
        services.AddSingleton<LadderMeta>();
        _ladder.AddTo(services);
        _services = services.BuildServiceProvider();

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.MetaState.Add(new MetaStateEntity { Id = 1 });
        db.SaveChanges();
    }

    public void Dispose()
    {
        _services.Dispose();
        _ladder.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_metaPath);
    }

    private LadderStore Store => _services.GetRequiredService<LadderStore>();

    private LadderMeta Meta => _services.GetRequiredService<LadderMeta>();

    [Fact]
    public void A_stored_deck_parses_back_to_its_cards_and_versions()
    {
        IReadOnlyList<CrownSeriesCard> cards =
        [
            new(26000000, 16, CardVersionKind.Evo),
            new(26000001, 15, CardVersionKind.Normal),
            new(26000002, 14, CardVersionKind.Hero),
        ];

        var (ids, versions) = LadderDeck.Parse(LadderDeck.Key(cards));

        Assert.Equal([26000000, 26000001, 26000002], ids);
        Assert.Equal(cards.Select(c => new CardVersion(c.Id, c.Version)), versions);
    }

    [Fact]
    public void A_side_is_read_with_its_opponents_levels_when_the_opponent_is_stored()
    {
        Store.Merge([
            Side("#A", "#B", 0, Build.Eight(1), BattleResult.Win, level: 15),
            Side("#B", "#A", 0, Build.Eight(9), BattleResult.Loss, level: 13),
            Side("#C", "#D", 1, Build.Eight(1), BattleResult.Win),
        ]);

        var sides = Store.ReadSides(LadderMode.TrophyRoad, 0).ToDictionary(s => s.PlayerTag);

        Assert.Equal(Enumerable.Repeat((byte)13, 8), sides["#A"].OpponentLevels!);
        Assert.Equal(Enumerable.Repeat((byte)15, 8), sides["#B"].OpponentLevels!);
        Assert.Null(sides["#C"].OpponentLevels);
        Assert.Empty(Store.ReadSides(LadderMode.Ranked, 0));
    }

    [Fact]
    public void A_level_edge_is_worth_wins_and_a_level_gap_costs_them()
    {
        var even = Enumerable.Repeat((byte)14, 8).ToArray();
        var ahead = Enumerable.Repeat((byte)16, 8).ToArray();

        Assert.Equal(0.5, LadderLevels.ExpectedWinShare(even, even), 10);
        Assert.Equal(0.5, LadderLevels.ExpectedWinShare(ahead, null), 10);
        Assert.True(LadderLevels.ExpectedWinShare(ahead, even) > 0.75);
        Assert.True(LadderLevels.ExpectedWinShare(even, ahead) < 0.25);
    }

    [Fact]
    public async Task A_deck_that_wins_on_levels_ranks_below_one_that_wins_at_even_levels()
    {
        var overleveled = Build.Eight(1);
        var even = Build.Eight(9);
        var filler = Build.Eight(17);
        var sides = new List<LadderBattle>();
        for (var i = 0; i < 100; i++)
        {
            var result = i < 60 ? BattleResult.Win : BattleResult.Loss;
            sides.Add(Side($"#O{i}", $"#OF{i}", i, overleveled, result, level: 16));
            sides.Add(Side($"#OF{i}", $"#O{i}", i, filler, Opposite(result), level: 14));
            var evenResult = i < 55 ? BattleResult.Win : BattleResult.Loss;
            sides.Add(Side($"#E{i}", $"#EF{i}", i, even, evenResult, level: 14));
            sides.Add(Side($"#EF{i}", $"#E{i}", i, filler, Opposite(evenResult), level: 14));
        }
        Store.Merge(sides);

        await Meta.RebuildAsync();

        var range = Meta.Current.ByGroup[new LadderGroup(LadderMode.TrophyRoad, 10000)];
        var winRate = range.Decks.ToDictionary(d => d.CardIds[0], d => d.WinRate);
        Assert.Equal(0.55, winRate[9], 6);
        Assert.True(winRate[1] < 0.4);
        var order = range.Decks.Select(d => d.CardIds[0]).ToList();
        Assert.True(order.IndexOf(9) < order.IndexOf(1));
        Assert.Equal(400, range.Sides);
        Assert.Equal((16 * 100 + 14 * 300) / 400.0, range.OpponentLevel, 6);
    }

    [Fact]
    public async Task A_range_leans_on_its_neighbours_and_a_range_without_decks_takes_the_nearest()
    {
        var sides = new List<LadderBattle>();
        for (var i = 0; i < 10; i++)
        {
            sides.Add(Side($"#A{i}", $"#B{i}", i, Build.Eight(1), BattleResult.Win, standing: 5000));
            sides.Add(Side($"#B{i}", $"#A{i}", i, Build.Eight(9), BattleResult.Loss, standing: 5000));
            sides.Add(Side($"#C{i}", $"#D{i}", i, Build.Eight(17), BattleResult.Win, standing: 7500));
            sides.Add(Side($"#D{i}", $"#C{i}", i, Build.Eight(25), BattleResult.Loss, standing: 7500));
        }
        Store.Merge(sides);

        await Meta.RebuildAsync();

        var current = Meta.Current;
        var empty = current.ByGroup[new LadderGroup(LadderMode.TrophyRoad, 6000)];
        Assert.Equal(0, empty.Sides);
        Assert.Equal(40 * 0.5, empty.BorrowedSides, 6);
        Assert.Equal(4, empty.Decks.Count);
        Assert.Equal(20 * 0.25, current.ByGroup[new LadderGroup(LadderMode.TrophyRoad, 5000)].BorrowedSides, 6);
        Assert.Equal(new LadderGroup(LadderMode.TrophyRoad, 7000), current.For(new LadderGroup(LadderMode.TrophyRoad, 12000))?.Group);
        Assert.Null(current.For(new LadderGroup(LadderMode.Ranked, 3)));
    }

    [Fact]
    public async Task Ranked_sides_count_toward_their_league_only()
    {
        Store.Merge([
            Side("#A", "#B", 0, Build.Eight(1), BattleResult.Win, LadderMode.Ranked, 7),
            Side("#B", "#A", 0, Build.Eight(9), BattleResult.Loss, LadderMode.Ranked, 7),
            Side("#A", "#B", 1, Build.Eight(1), BattleResult.Win, LadderMode.Ranked, 7),
            Side("#B", "#A", 1, Build.Eight(9), BattleResult.Loss, LadderMode.Ranked, 7),
        ]);

        await Meta.RebuildAsync();

        var league = Meta.Current.ByGroup[new LadderGroup(LadderMode.Ranked, 7)];
        Assert.Equal(Build.Eight(1), league.Decks[0].CardIds);
        Assert.DoesNotContain(Meta.Current.ByGroup.Keys, g => g.Mode == LadderMode.TrophyRoad);
    }

    [Fact]
    public async Task Sides_below_the_lowest_range_and_older_than_the_retention_are_left_out()
    {
        var old = -new LadderOptions().RetentionMs / 60_000;
        Store.Merge([
            Side("#A", "#B", 0, Build.Eight(1), BattleResult.Win, standing: 3000),
            Side("#B", "#A", 0, Build.Eight(9), BattleResult.Loss, standing: 3000),
            Side("#C", "#D", old, Build.Eight(1), BattleResult.Win),
            Side("#D", "#C", old, Build.Eight(9), BattleResult.Loss),
        ]);

        await Meta.RebuildAsync();

        var range = Meta.Current.ByGroup[new LadderGroup(LadderMode.TrophyRoad, 10000)];
        Assert.Empty(range.Decks);
        Assert.DoesNotContain(new LadderGroup(LadderMode.TrophyRoad, 3000), Meta.Current.ByGroup.Keys);
    }

    [Theory]
    [InlineData(2500, 4000)]
    [InlineData(4000, 4000)]
    [InlineData(9999, 9000)]
    [InlineData(14000, 14000)]
    public void A_player_builds_for_their_trophy_range_and_at_least_the_lowest(int trophies, int floor)
        => Assert.Equal(new LadderGroup(LadderMode.TrophyRoad, floor),
            LadderDeckCache.GroupOf(Player() with { Trophies = trophies }, LadderMode.TrophyRoad, new LadderOptions()));

    [Theory]
    [InlineData(5, 3, 5)]
    [InlineData(null, 3, 3)]
    [InlineData(null, null, 1)]
    public void A_player_builds_for_this_seasons_league_then_last_seasons(int? current, int? last, int league)
    {
        var player = Player() with
        {
            CurrentPathOfLegendSeasonResult = current is { } c ? new CrRankedSeason(c) : null,
            LastPathOfLegendSeasonResult = last is { } l ? new CrRankedSeason(l) : null,
        };

        Assert.Equal(new LadderGroup(LadderMode.Ranked, league), LadderDeckCache.GroupOf(player, LadderMode.Ranked, new LadderOptions()));
    }

    [Fact]
    public void The_ladder_deck_is_one_deck_with_the_rest_as_alternatives()
    {
        var cards = Build.CardMap(Build.Collection(Enumerable.Range(1, 40).ToArray()));
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.55),
            Build.Deck(Build.Eight(5), confidence: 0.54),
            Build.Deck(Build.Eight(20), confidence: 0.50),
        };

        var result = new DeckAnalyzer().FindBestLadderDeck(meta, cards, opponentLevel: 16);

        Assert.Equal(Build.Eight(1), Assert.Single(result.Decks).CardIds);
        Assert.Equal(2, result.Alternatives.Count);
    }

    [Fact]
    public void Alternatives_need_as_many_players_as_the_ladder_deck()
    {
        var cards = Build.CardMap(Build.Collection(Enumerable.Range(1, 40).ToArray()));
        var meta = new[]
        {
            Build.Deck(Build.Eight(1), confidence: 0.60, players: 1),
            Build.Deck(Build.Eight(5), confidence: 0.55),
            Build.Deck(Build.Eight(20), confidence: 0.50),
        };

        var result = new DeckAnalyzer().FindBestLadderDeck(meta, cards, opponentLevel: 16);

        Assert.Equal(Build.Eight(5), Assert.Single(result.Decks).CardIds);
        Assert.Equal(Build.Eight(20), Assert.Single(result.Alternatives).CardIds);
    }

    [Fact]
    public void A_deck_of_the_players_strongest_cards_beats_a_slightly_better_deck_they_trail_in()
    {
        var strong = Build.Eight(1);
        var weak = Build.Eight(9);
        var cards = Build.CardMap(Enumerable.Range(1, 16)
            .Select(id => id >= 9 ? Build.Card(id, level: 12) : Build.Card(id)));
        var meta = new[] { Build.Deck(weak, confidence: 0.56), Build.Deck(strong, confidence: 0.54) };

        var result = new DeckAnalyzer().FindBestLadderDeck(meta, cards, opponentLevel: 15);

        Assert.Equal(strong, Assert.Single(result.Decks).CardIds);
    }

    private static CrPlayer Player() => new("#P", "Player", [], null, 14);

    private static BattleResult Opposite(BattleResult result)
        => result == BattleResult.Win ? BattleResult.Loss : BattleResult.Win;

    private static LadderBattle Side(
        string player, string opponent, long minute, int[] cards, BattleResult result,
        LadderMode mode = LadderMode.TrophyRoad, int standing = 10000, int level = 16) => new()
    {
        PlayerTag = player,
        OpponentTag = opponent,
        BattleTimeMs = Now + minute * 60_000 - 24 * 60 * 60_000,
        Mode = mode,
        Standing = standing,
        Result = result,
        Cards = cards.Select(id => new CrownSeriesCard(id, level, CardVersionKind.Normal)).ToList(),
    };
}
