using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SeasonBoostDetectionTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 15, 12, 0, 0, TimeSpan.Zero);
    private const string Today = "20261115T100000.000Z";
    private const string Yesterday = "20261114T100000.000Z";
    private const string LastWeek = "20261108T100000.000Z";

    private const int Boosted = 1;
    private const int Potion = 2;

    private static CrPlayer Player(int index, int kingTowerLevel = 16, int ownedLevel = 12)
        => new($"#P{index}", "Player", [new CrPlayerCard(Boosted, null, ownedLevel, 16, null, null, null, "common", null, null, null),
            new CrPlayerCard(Potion, null, ownedLevel, 16, null, null, null, "common", null, null, null)], null, kingTowerLevel);

    private static CrBattle Battle(CrPlayer player, string time, int cardId, int playedLevel, string type = "PvP", string mode = "Ladder")
        => new(type, time, new CrGameMode(null, mode), null,
            [new CrBattleSide(player.Tag, player.Name, [new CrBattleCard(cardId, 0, "common", playedLevel, 16)], 0, null)], []);

    private static SeasonBoostDetection.Sample Played(CrPlayer player, params CrBattle[] battles) => new(player, battles);

    private static IReadOnlySet<int> Detect(IEnumerable<SeasonBoostDetection.Sample> samples)
        => SeasonBoostDetection.BoostedCards(samples, Now);

    [Fact]
    public void ACardBoostedForEveryoneBelowKingLevel_IsASeasonBoost()
    {
        var samples = Enumerable.Range(0, 5).Select(i => Player(i)).Select(p => Played(p, Battle(p, Today, Boosted, 16)));

        Assert.Equal([Boosted], Detect(samples));
    }

    [Fact]
    public void ACardOnlySomePlayersBoosted_IsAPotion_NotASeasonBoost()
    {
        var samples = Enumerable.Range(0, 10).Select(i => Player(i))
            .Select((p, i) => Played(p, Battle(p, Today, Potion, i < 2 ? 16 : 12)));

        Assert.Empty(Detect(samples));
    }

    [Fact]
    public void TooFewPlayers_DontVouchForABoost()
    {
        var samples = Enumerable.Range(0, 4).Select(i => Player(i)).Select(p => Played(p, Battle(p, Today, Boosted, 16)));

        Assert.Empty(Detect(samples));
    }

    [Fact]
    public void BattlesOlderThanTheWindow_AreIgnored()
    {
        var samples = Enumerable.Range(0, 5).Select(i => Player(i)).Select(p => Played(p, Battle(p, LastWeek, Boosted, 16)));

        Assert.Empty(Detect(samples));
    }

    [Fact]
    public void EachPlayersLatestUse_DecidesWhenTheBoostEndedMeanwhile()
    {
        var samples = Enumerable.Range(0, 5).Select(i => Player(i))
            .Select(p => Played(p, Battle(p, Yesterday, Boosted, 16), Battle(p, Today, Boosted, 12)));

        Assert.Empty(Detect(samples));
    }

    [Fact]
    public void CardsAtKingLevel_AndPlayersBelowTheBoostLevel_SayNothing()
    {
        var maxed = Enumerable.Range(0, 5).Select(i => Player(i, ownedLevel: 16))
            .Select(p => Played(p, Battle(p, Today, Boosted, 16)));
        var tooLow = Enumerable.Range(5, 5).Select(i => Player(i, kingTowerLevel: 6, ownedLevel: 3))
            .Select(p => Played(p, Battle(p, Today, Boosted, 6)));
        var unboosted = Enumerable.Range(10, 5).Select(i => Player(i))
            .Select(p => Played(p, Battle(p, Today, Boosted, 12)));

        Assert.Empty(Detect(maxed.Concat(tooLow)));
        Assert.Empty(Detect(maxed.Concat(tooLow).Concat(unboosted)));
    }

    [Theory]
    [InlineData("riverRacePvP", "CW_Battle_1v1", true)]
    [InlineData("riverRaceDuel", "CW_Duel_1v1", true)]
    [InlineData("pathOfLegend", "Ranked1v1_NewArena2", true)]
    [InlineData("riverRacePvP", "Rage_Ladder", false)]
    [InlineData("trail", "Chaos_1v1_MegaDraft_S3", false)]
    [InlineData("friendly", "Friendly", false)]
    public void OnlyBattlesAtThePlayersOwnLevels_Count(string type, string mode, bool counts)
    {
        var samples = Enumerable.Range(0, 5).Select(i => Player(i))
            .Select(p => Played(p, Battle(p, Today, Boosted, 16, type, mode)));

        Assert.Equal(counts, Detect(samples).Contains(Boosted));
    }
}
