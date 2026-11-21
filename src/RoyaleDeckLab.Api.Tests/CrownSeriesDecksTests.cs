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
        services.AddScoped<DuelLevelFitRepository>();
        services.AddScoped(sp => new MetaBuilder(null!, null!, sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MetaOptions>>(),
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

        var kings = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, new LineupOptions { DeckCount = 3 }, DuelValues.Default);
        var hammer = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Hammer, new LineupOptions { DeckCount = 3 }, DuelValues.Default);

        Assert.Contains(kings.Decks, d => d.CardIds.SequenceEqual(maxedDeck));
        Assert.Contains(hammer.Decks, d => d.CardIds.SequenceEqual(lowerDeck));
        Assert.All(hammer.Decks.SelectMany(d => d.Cards), card => Assert.True(LevelModel.DisplayLevel(card) <= 13));
    }

    [Fact]
    public void Excluded_and_included_cards_shape_the_duel_lineup()
    {
        var cards = Build.CardMap(Build.Collection(Enumerable.Range(1, 48).ToArray()));
        var meta = new[] { 1, 9, 17, 25, 33 }.Select((s, i) => Build.Deck(Build.Eight(s), confidence: 0.60 - i * 0.01)).ToList();
        meta.Add(Build.Deck([1, 2, 3, 4, 5, 6, 7, 41], confidence: 0.40));

        var options = new LineupOptions { BannedCards = new HashSet<int> { 9 }, RequiredCards = new HashSet<int> { 41 } };
        var result = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, options, DuelValues.Default);

        Assert.Equal([1, 17, 25, 33], result.Decks.Select(d => d.CardIds.Min()).Order());
        Assert.Contains(result.Decks, d => d.CardIds.Contains(41));
        Assert.DoesNotContain(result.Decks.Concat(result.Alternatives), d => d.CardIds.Contains(9));
    }

    [Fact]
    public void A_locked_deck_stays_and_the_others_are_picked_around_it()
    {
        var cards = Build.CardMap(Build.Collection(Enumerable.Range(1, 48).ToArray()));
        var meta = new[] { 1, 9, 17, 25, 33 }.Select((s, i) => Build.Deck(Build.Eight(s), confidence: 0.60 - i * 0.01)).ToList();
        int[] lockedDeck = [1, 2, 3, 4, 33, 34, 35, 36];
        meta.Add(Build.Deck(lockedDeck, confidence: 0.40));

        var options = new LineupOptions { LockedDecks = [lockedDeck] };
        var result = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, options, DuelValues.Default);

        Assert.Equal(lockedDeck, result.Decks[0].CardIds);
        Assert.Equal([9, 17, 25], result.Decks.Skip(1).Select(d => d.CardIds.Min()).Order());
    }

    [Fact]
    public void A_locked_deck_no_longer_in_the_meta_counts_at_an_even_win_rate()
    {
        var cards = Build.CardMap(Build.Collection(Enumerable.Range(1, 48).ToArray()));
        var meta = new[] { Build.Deck(Build.Eight(9), confidence: 0.60) };

        var options = new LineupOptions { DeckCount = 2, LockedDecks = [Build.Eight(1)] };
        var result = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, options, DuelValues.Default);

        Assert.Equal(2, result.Decks.Count);
        Assert.Equal(0.5, result.Decks[0].PlayerScore, 10);
        Assert.Equal(0, result.Decks[0].Uses);
    }

    [Fact]
    public void A_required_card_played_without_its_hero_costs_the_hero_value_in_a_duel()
    {
        var cards = Build.CardMap(Enumerable.Range(1, 48).Select(id => Build.Card(id, evo: id == 4 ? EvolutionBits.Hero : 0)));
        var meta = new[] { 1, 9, 17, 25 }.Select(s => Build.Deck(Build.Eight(s), confidence: 0.55,
            versions: s == 1 ? [new CardVersion(4, CardVersionKind.Hero)] : null)).ToArray();
        var values = DuelValues.Default;
        double Logit(double p) => Math.Log(p / (1 - p));

        var best = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, LineupOptions.Default, values);
        var asked = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, new LineupOptions
        {
            RequiredCards = new HashSet<int> { 4 },
            RequiredVersions = new Dictionary<int, CardVersionKind> { [4] = CardVersionKind.Normal },
        }, values);

        var bestDeck = Assert.Single(best.Decks, d => d.CardIds.Contains(4));
        var askedDeck = Assert.Single(asked.Decks, d => d.CardIds.Contains(4));
        Assert.Equal(CardVersionKind.Normal, askedDeck.CardVersions!.Single(v => v.CardId == 4).Version);
        Assert.Equal(Logit(bestDeck.PlayerScore) - values.Specials.Hero, Logit(askedDeck.PlayerScore), 10);
    }

    [Theory]
    [InlineData(0.5, 0.1, CardVersionKind.Evo)]
    [InlineData(0.1, 0.5, CardVersionKind.Hero)]
    public void A_card_with_both_specials_is_played_as_the_one_worth_more(double evo, double hero, CardVersionKind shown)
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id, evo: id == 2 ? EvolutionBits.Evo | EvolutionBits.Hero : 0)));
        var values = DuelValues.Default with { Specials = new SpecialValues(evo, hero) };
        var meta = new[] { Build.Deck(Build.Eight(1), confidence: MetaConfidence) };

        var result = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, new LineupOptions { DeckCount = 1 }, values);

        Assert.Equal(shown, Assert.Single(result.Decks).CardVersions!.Single(v => v.CardId == 2).Version);
    }

    [Fact]
    public void An_owned_special_switches_to_the_version_worth_more()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id, evo: id switch
        {
            1 => EvolutionBits.Evo | EvolutionBits.Hero,
            4 => EvolutionBits.Evo,
            _ => 0,
        })));
        var values = DuelValues.Default with { Specials = new SpecialValues(Evo: 0.32, Hero: 0.12) };
        var meta = new[] { Build.Deck(Build.Eight(1), confidence: MetaConfidence, versions:
            [new(1, CardVersionKind.Hero), new(2, CardVersionKind.Evo), new(3, CardVersionKind.Evo)]) };

        var deck = Assert.Single(_analyzer.FindBestCrownSeriesDecks(
            meta, cards, CrownSeriesLeague.Kings, new LineupOptions { DeckCount = 1 }, values).Decks);

        Assert.Equal([CardVersionKind.Evo, CardVersionKind.Normal, CardVersionKind.Normal, CardVersionKind.Evo],
            deck.CardVersions!.Take(4).Select(v => v.Version));
        Assert.Equal(LevelModel.WinProbability(MetaConfidence, -(0.76 - 0.64)), deck.PlayerScore, 10);
    }

    [Fact]
    public void A_version_choice_costs_nothing_while_the_player_still_fields_what_the_meta_does()
    {
        var meta = new[] { 1, 9, 17, 25 }.Select(s => Build.Deck(Build.Eight(s), confidence: 0.55,
            versions: s == 1 ? [new CardVersion(2, CardVersionKind.Evo)] : null)).ToArray();
        Dictionary<int, PlayerItemLevel> Cards(params int[] heroes) => Build.CardMap(Enumerable.Range(1, 48)
            .Select(id => Build.Card(id, evo: id == 2 ? EvolutionBits.Evo : heroes.Contains(id) ? EvolutionBits.Hero : 0)));
        var normal3 = new LineupOptions
        {
            RequiredCards = new HashSet<int> { 3 },
            RequiredVersions = new Dictionary<int, CardVersionKind> { [3] = CardVersionKind.Normal },
        };

        var asked = _analyzer.FindBestCrownSeriesDecks(meta, Cards(3, 4), CrownSeriesLeague.Kings, normal3, DuelValues.Default);
        var without = _analyzer.FindBestCrownSeriesDecks(meta, Cards(4), CrownSeriesLeague.Kings,
            new LineupOptions { RequiredCards = new HashSet<int> { 3 } }, DuelValues.Default);

        var askedDeck = Assert.Single(asked.Decks, d => d.CardIds.Contains(3));
        Assert.Equal(CardVersionKind.Normal, askedDeck.CardVersions!.Single(v => v.CardId == 3).Version);
        Assert.Equal(Assert.Single(without.Decks, d => d.CardIds.Contains(3)).PlayerScore, askedDeck.PlayerScore, 10);
    }

    [Fact]
    public void A_missing_meta_special_costs_nothing_when_another_card_in_the_deck_fills_its_slot()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id, evo: id == 2 ? EvolutionBits.Evo : 0)));

        var score = DuelScore(cards, (1, CardVersionKind.Evo));

        Assert.Equal(MetaConfidence, score, 10);
    }

    [Fact]
    public void Each_missing_evo_and_hero_costs_its_fitted_log_odds()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id)));

        var score = DuelScore(cards, (1, CardVersionKind.Evo), (2, CardVersionKind.Hero));

        Assert.Equal(LevelModel.WinProbability(MetaConfidence, -(CrownSeriesLevels.Specials.Evo + CrownSeriesLevels.Specials.Hero)), score, 10);
    }

    [Fact]
    public void A_champion_fills_a_hero_slot()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => id switch
        {
            2 => Build.Card(id, evo: EvolutionBits.Hero),
            3 => Build.Card(id, rarity: Rarity.Champion),
            _ => Build.Card(id),
        }));

        var score = DuelScore(cards, (1, CardVersionKind.Hero), (3, CardVersionKind.Hero));

        Assert.Equal(MetaConfidence, score, 10);
    }

    [Fact]
    public void Evos_fill_at_most_two_slots()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id, evo: id <= 3 ? EvolutionBits.Evo : 0)));

        var score = DuelScore(cards, (1, CardVersionKind.Evo), (2, CardVersionKind.Evo), (4, CardVersionKind.Hero));

        Assert.Equal(LevelModel.WinProbability(MetaConfidence, -CrownSeriesLevels.Specials.Hero), score, 10);
    }

    [Fact]
    public void A_hero_in_place_of_a_meta_evo_costs_the_difference()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id, evo: id == 2 ? EvolutionBits.Hero : 0)));

        var score = DuelScore(cards, (1, CardVersionKind.Evo));

        var difference = CrownSeriesLevels.Specials.Evo - CrownSeriesLevels.Specials.Hero;
        Assert.Equal(LevelModel.WinProbability(MetaConfidence, -difference), score, 10);
    }

    private const double MetaConfidence = 0.55;

    [Fact]
    public void Scores_with_the_values_it_is_given()
    {
        var cards = Build.CardMap(Build.Eight(1).Select(id => Build.Card(id)));
        var values = DuelValues.Default with { Specials = new SpecialValues(Evo: 0.5, Hero: 0.1) };

        var score = DuelScoreWith(values, cards, (1, CardVersionKind.Evo));

        Assert.Equal(LevelModel.WinProbability(MetaConfidence, -0.5), score, 10);
    }

    private double DuelScore(Dictionary<int, PlayerItemLevel> cards, params (int Id, CardVersionKind Version)[] specials)
        => DuelScoreWith(DuelValues.Default, cards, specials);

    private double DuelScoreWith(
        DuelValues values, Dictionary<int, PlayerItemLevel> cards, params (int Id, CardVersionKind Version)[] specials)
    {
        var deck = Build.Eight(1);
        var versions = deck
            .Select(id => new CardVersion(id, specials.FirstOrDefault(s => s.Id == id).Version))
            .ToList();
        var meta = new[] { Build.Deck(deck, confidence: MetaConfidence, versions: versions) };

        var result = _analyzer.FindBestCrownSeriesDecks(meta, cards, CrownSeriesLeague.Kings, new LineupOptions { DeckCount = 1 }, values);

        return Assert.Single(result.Decks).PlayerScore;
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
        var meta = Meta();

        await meta.RebuildAsync();

        var kings = meta.Current.ForCap(16);
        Assert.Equal(60, meta.Current.Rounds);
        Assert.Equal(60, kings.Rounds);
        Assert.Equal(strong, kings.Decks[0].CardIds);
        Assert.Equal(1.0, kings.Decks[0].WinRate);
        Assert.Equal(0.0, kings.Decks[1].WinRate);
        Assert.Equal(30, kings.Decks[0].Players);
        Assert.Equal(30, kings.Decks[0].LeagueUses);
    }

    [Fact]
    public async Task A_duel_counts_at_the_cap_shown_by_the_highest_card_either_player_fielded()
    {
        var capped = Build.Eight(1);
        var opponent = Build.Eight(9);
        await StoreAsync(
            Round("#A", "#B", 0, capped, BattleResult.Win, level: 12),
            Round("#B", "#A", 0, opponent, BattleResult.Loss, level: 13));

        var meta = Meta();
        await meta.RebuildAsync();

        Assert.Equal(2, meta.Current.ForCap(13).Rounds);
        Assert.Equal(0, meta.Current.ForCap(12).Rounds);
    }

    [Fact]
    public async Task A_league_ranks_by_its_own_rounds_and_leans_on_other_caps_less()
    {
        var hammerWinner = Build.Eight(1);
        var kingsWinner = Build.Eight(9);
        var filler = Build.Eight(17);
        var rounds = new List<CrownSeriesRound>();
        for (var i = 0; i < 30; i++)
        {
            rounds.Add(Round($"#H{i}", $"#HO{i}", i, hammerWinner, BattleResult.Win, level: 13));
            rounds.Add(Round($"#HO{i}", $"#H{i}", i, kingsWinner, BattleResult.Loss, level: 13));
            rounds.Add(Round($"#K{i}", $"#KO{i}", i, kingsWinner, BattleResult.Win));
            rounds.Add(Round($"#KO{i}", $"#K{i}", i, filler, BattleResult.Loss));
        }
        await StoreAsync([.. rounds]);

        var meta = Meta();
        await meta.RebuildAsync();

        var hammer = meta.Current.ForCap(13);
        var kings = meta.Current.ForCap(16);
        Assert.Equal(hammerWinner, hammer.Decks[0].CardIds);
        Assert.Equal(kingsWinner, kings.Decks[0].CardIds);
        Assert.Equal(60, hammer.Rounds);
        Assert.Equal(60 * 0.5 * 0.5 * 0.5, hammer.BorrowedRounds, 6);
        var borrowed = hammer.Decks.Single(d => d.CardIds.SequenceEqual(filler));
        Assert.Equal(0, borrowed.LeagueUses);
        Assert.Equal(30, borrowed.Uses);
    }

    [Fact]
    public async Task The_decks_are_built_again_only_when_the_rounds_changed()
    {
        await StoreAsync(
            Round("#A", "#B", 0, Build.Eight(1), BattleResult.Win),
            Round("#B", "#A", 0, Build.Eight(9), BattleResult.Loss));
        var meta = Meta();
        await meta.RebuildAsync();
        var built = meta.Current.Version;

        await meta.RebuildAsync(roundsChanged: false, rounds: null);
        var unchanged = meta.Current.Version;
        await meta.RebuildAsync(roundsChanged: true, rounds: null);

        Assert.Equal(built, unchanged);
        Assert.Equal(built + 1, meta.Current.Version);
    }

    [Fact]
    public async Task The_meta_builds_with_the_applied_cushion_and_again_when_it_changes()
    {
        var rounds = Enumerable.Range(0, 30).SelectMany(i => new[]
        {
            Round($"#A{i}", $"#B{i}", i, Build.Eight(1), BattleResult.Win),
            Round($"#B{i}", $"#A{i}", i, Build.Eight(9), BattleResult.Loss),
        }).ToArray();
        await StoreAsync(rounds);
        var store = new DuelValuesStore(_services.GetRequiredService<IServiceScopeFactory>());
        var meta = Meta(store);
        await meta.RebuildAsync();
        var withDefault = meta.Current.ForCap(16).Decks[0].Confidence;

        store.Set(new AppliedDuelValues(DuelValues.Default with { PriorRounds = 20 }, 1, 0, 1));
        await meta.RebuildAsync(roundsChanged: false, rounds: null);

        Assert.Equal(20, meta.Current.Values.PriorRounds);
        Assert.True(meta.Current.ForCap(16).Decks[0].Confidence > withDefault);
    }

    private CrownSeriesMeta Meta(DuelValuesStore? store = null) => new(
        _services.GetRequiredService<IServiceScopeFactory>(),
        Microsoft.Extensions.Options.Options.Create(new CrownSeriesOptions()),
        store ?? new DuelValuesStore(_services.GetRequiredService<IServiceScopeFactory>()),
        NullLogger<CrownSeriesMeta>.Instance);

    private async Task StoreAsync(params CrownSeriesRound[] rounds)
    {
        using var scope = _services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().MergeRoundsAsync(rounds);
    }

    private static CrownSeriesRound Round(
        string player, string opponent, int minute, int[] cards, BattleResult result, int level = 16) => new()
    {
        PlayerTag = player,
        OpponentTag = opponent,
        BattleTimeMs = 1_763_024_400_000 + minute * 60_000L,
        Round = 0,
        Result = result,
        Cards = cards.Select(id => new CrownSeriesCard(id, level, CardVersionKind.Normal)).ToList(),
        League = 1,
        EventTag = "#2UR9289L",
        GameModeId = 72000513,
    };
}
