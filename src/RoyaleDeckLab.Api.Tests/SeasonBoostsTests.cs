using System.Text.Json;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SeasonBoostsTests
{
    private static readonly SeasonBoosts Boosts = new(new HashSet<int> { 1, 2, 3, 99 });

    [Fact]
    public void For_ListsOnlyOwnedBoostedCardsBelowKingTowerLevel()
    {
        var cards = Build.CardMap([
            Build.Card(1, level: 11),
            Build.Card(2, level: 14),
            Build.Card(3, level: 12),
            Build.Card(4, level: 9),
        ]);

        var boosts = Boosts.For(cards, kingTowerLevel: 15);

        Assert.Equal(15, boosts.Level);
        Assert.Equal([1, 3], boosts.CardIds);
    }

    [Fact]
    public void For_BoostsNothing_BelowTheKingTowerLevelBoostsStartAt()
    {
        var cards = Build.CardMap([Build.Card(1, level: 2, maxLevel: 14)]);

        Assert.Empty(Boosts.For(cards, kingTowerLevel: 6).CardIds);
        Assert.Equal([1], Boosts.For(cards, kingTowerLevel: 7).CardIds);
    }

    [Theory]
    [InlineData(10, 16)]
    [InlineData(5, 11)]
    [InlineData(1, 8)]
    public void ApplyTo_RaisesTheCardToKingTowerLevel_WhateverItsRarityCap(int level, int maxLevel)
    {
        var cards = Build.CardMap([Build.Card(1, level: level, maxLevel: maxLevel), Build.Card(5, level: 12)]);

        var boosted = Boosts.For(cards, kingTowerLevel: 15).ApplyTo(cards);

        Assert.Equal(15, LevelModel.DisplayLevel(boosted[1]));
        Assert.Equal(level, boosted[1].BoostedFromLevel);
        Assert.Equal(level, boosted[1].OwnedLevel);
        Assert.Equal(cards[5], boosted[5]);
    }

    [Fact]
    public void ApplyTo_LeavesTheExpectedOpponentsWhereTheOwnedLevelsPutThem()
    {
        var cards = Build.CardMap(Enumerable.Range(1, 40).Select(id => Build.Card(id, level: 10)));

        var boosted = Boosts.For(cards, kingTowerLevel: 16).ApplyTo(cards);

        Assert.Equal(LevelModel.OpponentLevel(cards.Values), LevelModel.OpponentLevel(boosted.Values), 10);
    }

    [Fact]
    public void BoostedCards_AreSentWithTheirOwnLevel_AndTheLevelTheyPlayAt()
    {
        var cards = Build.CardMap([Build.Card(1, level: 11)]);
        var boosted = Boosts.For(cards, kingTowerLevel: 16).ApplyTo(cards);

        var json = JsonSerializer.Serialize(boosted[1], new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.Contains("\"level\":14", json);
        Assert.Contains("\"boostedFromLevel\":11", json);
        Assert.DoesNotContain("ownedLevel", json);
    }

    [Fact]
    public void Generator_PicksTheDeckTheBoostLiftsAboveTheOther()
    {
        var analyzer = new DeckAnalyzer();
        var cards = Build.CardMap(
            Enumerable.Range(1, 8).Select(id => Build.Card(id, level: 10))
                .Concat(Enumerable.Range(9, 8).Select(id => Build.Card(id, level: 13))));
        var meta = new[] { Build.Deck(Build.Eight(1)), Build.Deck(Build.Eight(9)) };
        var options = new LineupOptions { DeckCount = 1 };
        var boosts = new SeasonBoosts(Build.Eight(1).ToHashSet()).For(cards, kingTowerLevel: 16);

        var plain = analyzer.FindBestWarDecks(meta, cards, options);
        var boosted = analyzer.FindBestWarDecks(meta, boosts.ApplyTo(cards), options);

        Assert.Equal(Build.Eight(9), plain.Decks[0].CardIds);
        Assert.Equal(Build.Eight(1), boosted.Decks[0].CardIds);
        Assert.All(boosted.Decks[0].Cards, card => Assert.Equal(10, card.BoostedFromLevel));
    }

    [Fact]
    public void Generator_MinimumLevel_CountsTheBoostedLevel()
    {
        var analyzer = new DeckAnalyzer();
        var cards = Build.CardMap(Enumerable.Range(1, 8).Select(id => Build.Card(id, level: 10)));
        var meta = new[] { Build.Deck(Build.Eight(1)) };
        var options = new LineupOptions { MinLevel = 15 };
        var boosts = new SeasonBoosts(Build.Eight(1).ToHashSet()).For(cards, kingTowerLevel: 16);

        Assert.Empty(analyzer.FindBestWarDecks(meta, cards, options).Decks);
        Assert.Single(analyzer.FindBestWarDecks(meta, boosts.ApplyTo(cards), options).Decks);
    }

    [Fact]
    public void CalculationKey_ChangesWithTheBoostsApplied()
    {
        var player = new Dtos.CrPlayer("#PLAYER", "Player", [], null, KingTowerLevel: 16);
        var boosts = new PlayerSeasonBoosts(16, [1, 2]);

        var withoutBoosts = PlayerCalculationKey.Create(player, 1, LineupOptions.Default);
        var withBoosts = PlayerCalculationKey.Create(player, 1, LineupOptions.Default, boosts);
        var otherBoosts = PlayerCalculationKey.Create(player, 1, LineupOptions.Default, boosts with { CardIds = [1, 3] });

        Assert.NotEqual(withoutBoosts, withBoosts);
        Assert.NotEqual(withBoosts, otherBoosts);
    }
}
