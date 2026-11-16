using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CrownSeriesDecksTests : IDisposable
{
    private readonly DeckAnalyzer _analyzer = new();
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"crownseries-{Guid.NewGuid():N}.db");
    private readonly ServiceProvider _services;

    public CrownSeriesDecksTests()
    {
        var services = new ServiceCollection();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<BattleRepository>();
        services.AddScoped<CrownSeriesRepository>();
        services.AddScoped(sp => new MetaBuilder(null!, sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MetaOptions>>(),
            NullLogger<MetaBuilder>.Instance));
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
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    [Theory]
    [InlineData(CrownSeriesLeague.Dagger, 11)]
    [InlineData(CrownSeriesLeague.Magic, 12)]
    [InlineData(CrownSeriesLeague.Armor, 13)]
    [InlineData(CrownSeriesLeague.Phantom, 14)]
    [InlineData(CrownSeriesLeague.Queens, 15)]
    [InlineData(CrownSeriesLeague.Kings, 16)]
    public void EachLeague_HasItsLevelCap(CrownSeriesLeague league, int cap)
        => Assert.Equal(cap, league.LevelCap());

    [Theory]
    [InlineData("kings", true)]
    [InlineData("Queens", true)]
    [InlineData("3", false)]
    [InlineData("gold", false)]
    [InlineData(null, false)]
    public void LeagueNames_Parse_ButNotNumbers(string? value, bool parses)
        => Assert.Equal(parses, CrownSeriesLeagueExtensions.TryParse(value, out _));

    [Fact]
    public void CardsAboveTheCap_PlayAtTheCap_AndLowerCardsKeepTheirLevel()
    {
        var cards = Build.CardMap([Build.Card(1, level: 14, maxLevel: 14), Build.Card(2, level: 9, maxLevel: 14)]);

        var capped = CrownSeriesLeague.Hammer.CapLevels(cards);

        Assert.Equal(13, LevelModel.DisplayLevel(capped[1]));
        Assert.Equal(14, capped[1].CappedFromLevel);
        Assert.Equal(11, LevelModel.DisplayLevel(capped[2]));
        Assert.Null(capped[2].CappedFromLevel);
    }

    [Fact]
    public void TheOpponent_IsNeverAboveTheCap()
    {
        var maxed = CrownSeriesLeague.Hammer.CapLevels(Build.CardMap(Build.Collection(Enumerable.Range(1, 40).ToArray())));

        Assert.Equal(13, CrownSeriesLevels.OpponentLevel(maxed.Values, CrownSeriesLeague.Hammer));
    }

    [Fact]
    public void LevelsAboveTheCap_GiveNoEdge()
    {
        var maxedDeck = Build.Eight(1);
        int[] lowerDeck = [8, 9, 10, 11, 12, 13, 14, 15];
        var cards = Build.CardMap(Enumerable.Range(1, 40)
            .Select(id => id is >= 9 and <= 15 ? Build.Card(id, level: 11) : Build.Card(id)));
        var meta = new[]
        {
            Build.Deck(maxedDeck, confidence: 0.55),
            Build.Deck(lowerDeck, confidence: 0.56),
            Build.Deck(Build.Eight(20), confidence: 0.50),
            Build.Deck(Build.Eight(30), confidence: 0.50),
        };

        var kings = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, deckCount: 3);
        var hammer = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Hammer, deckCount: 3);

        Assert.Contains(kings.Decks, d => d.CardIds.SequenceEqual(maxedDeck));
        Assert.Contains(hammer.Decks, d => d.CardIds.SequenceEqual(lowerDeck));
        Assert.All(hammer.Decks.SelectMany(d => d.Cards), card => Assert.True(LevelModel.DisplayLevel(card) <= 13));
    }

    [Fact]
    public async Task TheMeta_RanksDuelDecks_ByTheirStoredRounds()
    {
        var strong = Build.Eight(1);
        var weak = Build.Eight(9);
        var rounds = Enumerable.Range(0, 30).SelectMany(i => new[]
        {
            Round($"#A{i}", $"#B{i}", i, strong, BattleResult.Win),
            Round($"#B{i}", $"#A{i}", i, weak, BattleResult.Loss),
        }).ToList();
        using (var scope = _services.CreateScope())
        {
            await scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().MergeRoundsAsync(rounds);
        }
        var meta = new CrownSeriesMeta(_services.GetRequiredService<IServiceScopeFactory>(), NullLogger<CrownSeriesMeta>.Instance);

        await meta.RebuildAsync();

        Assert.Equal(60, meta.Current.Rounds);
        Assert.Equal(strong, meta.Current.Decks[0].CardIds);
        Assert.Equal(1.0, meta.Current.Decks[0].WinRate);
        Assert.Equal(0.0, meta.Current.Decks[1].WinRate);
        Assert.Equal(30, meta.Current.Decks[0].Players);
    }

    private static CrownSeriesRound Round(string player, string opponent, int minute, int[] cards, BattleResult result) => new()
    {
        PlayerTag = player,
        OpponentTag = opponent,
        BattleTimeMs = 1_763_024_400_000 + minute * 60_000L,
        Round = 0,
        Result = result,
        Cards = cards.Select(id => new CrownSeriesCard(id, 16, CardVersionKind.Normal)).ToList(),
        League = 1,
        EventTag = "#2UR9289L",
        GameModeId = 72000513,
    };
}
