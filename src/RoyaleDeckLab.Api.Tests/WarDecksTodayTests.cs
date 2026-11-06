using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class WarDecksTodayTests
{
    private static List<CrBattleCard> Deck(int first)
        => Enumerable.Range(first, 8).Select(id => new CrBattleCard(id, 0, "common")).ToList();

    private static CrBattle Battle(string type, List<CrBattleCard> cards)
        => new(type, "20261106T153815.000Z", null, null, [new CrBattleSide("#ME", "Me", cards, 1, null)], []);

    private static CrBattle Duel(params List<CrBattleCard>[] rounds)
    {
        var side = new CrBattleSide("#ME", "Me", rounds.SelectMany(r => r).ToList(), 1, rounds.Select(r => new CrBattleRound(1, r)).ToList());
        return new CrBattle("riverRaceDuel", "20261106T153048.000Z", null, null, [side], []);
    }

    [Fact]
    public void TakesTheNewestWarDecks_SkippingOtherModes_AndSplittingDuelsIntoRounds()
    {
        var log = new List<CrBattle>
        {
            Battle("riverRacePvP", Deck(100)),
            Battle("pathOfLegend", Deck(900)),
            Duel(Deck(200), Deck(300)),
            Battle("boatBattle", Deck(400)),
            Battle("riverRacePvP", Deck(500)),
        };

        var today = WarDecksToday.From(4, log);

        Assert.Equal(4, today.DecksUsed);
        Assert.Equal([100, 300, 200, 400], today.Decks.Select(d => d.CardIds[0]));
    }

    [Fact]
    public void StopsInsideADuel_WhenTheCountIsReached()
    {
        var today = WarDecksToday.From(2, [Battle("riverRacePvP", Deck(100)), Duel(Deck(200), Deck(300))]);

        Assert.Equal([100, 300], today.Decks.Select(d => d.CardIds[0]));
    }

    [Fact]
    public void ReturnsWhatTheLogHas_WhenItHoldsFewerWarDecksThanUsed()
    {
        var today = WarDecksToday.From(3, [Battle("riverRacePvP", Deck(100)), Battle("trail", Deck(900))]);

        Assert.Equal(3, today.DecksUsed);
        Assert.Single(today.Decks);
    }

    [Fact]
    public void KeepsTheVersionEachCardWasPlayedAs()
    {
        var cards = Deck(100);
        cards[0] = new CrBattleCard(100, 1, "common");
        cards[1] = new CrBattleCard(101, 0, "champion");

        var deck = Assert.Single(WarDecksToday.From(1, [Battle("riverRacePvP", cards)]).Decks);

        Assert.Equal(CardVersionKind.Evo, deck.CardVersions[0].Version);
        Assert.Equal(CardVersionKind.Hero, deck.CardVersions[1].Version);
        Assert.Equal(CardVersionKind.Normal, deck.CardVersions[2].Version);
    }
}
