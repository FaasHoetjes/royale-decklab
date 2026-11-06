using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ClanWarTests
{
    private const string ClanTagValue = "#CLAN";

    private static ClanResponse Clan(params ClanMember[] members) => new(ClanTagValue, "Example", members.ToList());

    private static ClanMember Member(string tag, string name, string role = "member")
        => new(tag, name, role, "20261106T154147.000Z");

    private static CrRiverRaceParticipant Played(string tag, int today, int week, int fame = 0)
        => new(tag, fame, week, today);

    private static CrRiverRace Race(string periodType, int periodIndex, params CrRiverRaceParticipant[] participants)
        => new(periodType, periodIndex, new CrRiverRaceClan(ClanTagValue, 0, participants.ToList()));

    private static CrRiverRaceLogEntry Week(int sectionIndex, int rank, int fame, params CrRiverRaceParticipant[] participants)
        => new(137, sectionIndex, "20261102T093905.000Z",
        [
            new CrRiverRaceStanding(1, new CrRiverRaceClan("#OTHER", 9_000, [])),
            new CrRiverRaceStanding(rank, new CrRiverRaceClan(ClanTagValue, fame, participants.ToList())),
        ]);

    private static readonly CrRiverRaceLog NoHistory = new([]);

    [Fact]
    public void OnAWarDay_MembersWithTheMostDecksLeftComeFirst()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "bob"), Member("#C", "Cees"), Member("#D", "Dirk"));
        var race = Race("warDay", 4, Played("#A", 4, 8), Played("#B", 0, 4), Played("#C", 1, 5));

        var war = ClanWar.From(clan, race, NoHistory);

        Assert.Equal(["#B", "#D", "#C", "#A"], war.Members.Select(m => m.Tag));
        Assert.Equal([4, 4, 3, 0], war.Members.Select(m => m.DecksLeftToday));
        Assert.Equal(11, war.DecksLeftToday);
        Assert.Equal(1, war.MembersDoneToday);
    }

    [Fact]
    public void MembersWithEqualDecksLeft_AreSortedByNameIgnoringCase()
    {
        var clan = Clan(Member("#A", "zed"), Member("#B", "Anna"), Member("#C", "bob"));

        var war = ClanWar.From(clan, Race("warDay", 3), NoHistory);

        Assert.Equal(["Anna", "bob", "zed"], war.Members.Select(m => m.Name));
    }

    [Theory]
    [InlineData("warDay", 3, WarPeriod.WarDay, 1)]
    [InlineData("warDay", 6, WarPeriod.WarDay, 4)]
    [InlineData("warDay", 11, WarPeriod.WarDay, 2)]
    [InlineData("colosseum", 25, WarPeriod.Colosseum, 2)]
    [InlineData("training", 0, WarPeriod.Training, 1)]
    [InlineData("training", 9, WarPeriod.Training, 3)]
    public void ThePeriodIndex_GivesTheDayWithinTheWeek(string periodType, int periodIndex, WarPeriod period, int day)
    {
        var war = ClanWar.From(Clan(), Race(periodType, periodIndex), NoHistory);

        Assert.Equal(period, war.Period);
        Assert.Equal(day, war.Day);
    }

    [Fact]
    public void ColosseumDays_AreBattleDays()
    {
        var clan = Clan(Member("#A", "Anna"));

        var war = ClanWar.From(clan, Race("colosseum", 5, Played("#A", 1, 9)), NoHistory);

        Assert.True(war.IsBattleDay);
        Assert.Equal(3, war.Members[0].DecksLeftToday);
    }

    [Fact]
    public void OnATrainingDay_NobodyHasDecksLeft_AndLastWeeksWeakestComeFirst()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "Bob"), Member("#NEW", "Newcomer"), Member("#C", "Cees"));
        var log = new CrRiverRaceLog([Week(2, 3, 20_000, Played("#A", 0, 16), Played("#B", 0, 4), Played("#C", 0, 12))]);

        var war = ClanWar.From(clan, Race("training", 1), log);

        Assert.False(war.IsBattleDay);
        Assert.Equal(0, war.DecksLeftToday);
        Assert.Equal(0, war.MembersDoneToday);
        Assert.Equal(["#B", "#C", "#A", "#NEW"], war.Members.Select(m => m.Tag));
    }

    [Fact]
    public void PastWeeks_LineUpPerMember_WithNullForWeeksOutsideTheClan()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "Bob"));
        var log = new CrRiverRaceLog(
        [
            Week(3, 2, 30_000, Played("#A", 0, 16), Played("#B", 0, 10)),
            Week(2, 4, 25_000, Played("#A", 0, 12)),
        ]);

        var war = ClanWar.From(clan, Race("warDay", 3), log);

        Assert.Equal(
            [new PastWarWeek(137, 4, 2, 30_000, new DateTimeOffset(2026, 11, 2, 9, 39, 5, TimeSpan.Zero)), new PastWarWeek(137, 3, 4, 25_000, new DateTimeOffset(2026, 11, 2, 9, 39, 5, TimeSpan.Zero))],
            war.PastWeeks);
        Assert.Equal([16, 12], war.Members.Single(m => m.Tag == "#A").DecksUsedPastWeeks);
        Assert.Equal([10, null], war.Members.Single(m => m.Tag == "#B").DecksUsedPastWeeks);
    }

    [Fact]
    public void LogEntriesWithoutThisClan_AreLeftOut()
    {
        var other = new CrRiverRaceLogEntry(137, 1, null, [new CrRiverRaceStanding(1, new CrRiverRaceClan("#OTHER", 1, []))]);

        var war = ClanWar.From(Clan(Member("#A", "Anna")), Race("warDay", 3), new CrRiverRaceLog([other]));

        Assert.Empty(war.PastWeeks);
        Assert.Empty(war.Members[0].DecksUsedPastWeeks);
    }

    [Fact]
    public void PlayersWhoLeft_AreNotMembers_AndOnlyCountWhenTheyPlayedThisWeek()
    {
        var clan = Clan(Member("#A", "Anna"));
        var race = Race("warDay", 4, Played("#A", 2, 6), Played("#GONE", 0, 4), Played("#IDLE", 0, 0));

        var war = ClanWar.From(clan, race, NoHistory);

        Assert.Equal(["#A"], war.Members.Select(m => m.Tag));
        Assert.Equal(1, war.LeaversWithDecks);
    }

    [Fact]
    public void AMemberMissingFromTheRace_HasPlayedNothing()
    {
        var war = ClanWar.From(Clan(Member("#A", "Anna", "coLeader")), Race("warDay", 3), NoHistory);

        var member = Assert.Single(war.Members);
        Assert.Equal(0, member.DecksUsedToday);
        Assert.Equal(0, member.DecksUsedThisWeek);
        Assert.Equal(4, member.DecksLeftToday);
        Assert.Equal(ClanRole.CoLeader, member.Role);
        Assert.Equal(new DateTimeOffset(2026, 11, 6, 15, 41, 47, TimeSpan.Zero), member.LastSeen);
    }

    [Fact]
    public void AnUnknownPeriodType_FailsInsteadOfGuessing()
    {
        Assert.Throws<FormatException>(() => ClanWar.From(Clan(), Race("somethingNew", 3), NoHistory));
    }
}
