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

    private static readonly DateTimeOffset Now = new(2026, 11, 6, 8, 0, 0, TimeSpan.Zero);

    private static CrRiverRaceClan RaceClan(string tag, int fame, int medalsToday = 0, params CrRiverRaceParticipant[] participants)
        => new(tag, tag.TrimStart('#'), fame, medalsToday, participants.ToList());

    private static CrRiverRace Race(string periodType, int periodIndex, params CrRiverRaceParticipant[] participants)
        => new(periodType, periodIndex, RaceClan(ClanTagValue, 0, 0, participants), []);

    private static CrRiverRaceLogEntry Week(int sectionIndex, int rank, int fame, params CrRiverRaceParticipant[] participants)
        => new(137, sectionIndex, "20261102T093905.000Z",
        [
            new CrRiverRaceStanding(1, RaceClan("#OTHER", 9_000)),
            new CrRiverRaceStanding(rank, RaceClan(ClanTagValue, fame, 0, participants)),
        ]);

    private static readonly CrRiverRaceLog NoHistory = new([]);

    [Fact]
    public void OnAWarDay_MembersWithTheMostDecksLeftComeFirst()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "bob"), Member("#C", "Cees"), Member("#D", "Dirk"));
        var race = Race("warDay", 4, Played("#A", 4, 8), Played("#B", 0, 4), Played("#C", 1, 5));

        var war = ClanWar.From(clan, race, NoHistory, Now);

        Assert.Equal(["#B", "#D", "#C", "#A"], war.Members.Select(m => m.Tag));
        Assert.Equal([4, 4, 3, 0], war.Members.Select(m => m.DecksLeftToday));
        Assert.Equal(11, war.DecksLeftToday);
        Assert.Equal(1, war.MembersDoneToday);
    }

    [Fact]
    public void MembersWithEqualDecksLeft_AreSortedByNameIgnoringCase()
    {
        var clan = Clan(Member("#A", "zed"), Member("#B", "Anna"), Member("#C", "bob"));

        var war = ClanWar.From(clan, Race("warDay", 3), NoHistory, Now);

        Assert.Equal(["Anna", "bob", "zed"], war.Members.Select(m => m.Name));
    }

    [Theory]
    [InlineData("warDay", 3, WarPeriod.WarDay, 1)]
    [InlineData("warDay", 6, WarPeriod.WarDay, 4)]
    [InlineData("warDay", 11, WarPeriod.WarDay, 2)]
    [InlineData("colosseum", 25, WarPeriod.Colosseum, 2)]
    [InlineData("training", 0, WarPeriod.Training, 1)]
    [InlineData("training", 9, WarPeriod.Training, 3)]
    [InlineData("someNewPeriod", 1, WarPeriod.Training, 2)]
    [InlineData("someNewPeriod", 5, WarPeriod.WarDay, 3)]
    public void ThePeriodIndex_GivesTheDayWithinTheWeek(string periodType, int periodIndex, WarPeriod period, int day)
    {
        var war = ClanWar.From(Clan(), Race(periodType, periodIndex), NoHistory, Now);

        Assert.Equal(period, war.Period);
        Assert.Equal(day, war.Day);
    }

    [Fact]
    public void AnUnknownPeriodOnABattleDay_StillCountsTheDecksLeft()
    {
        var clan = Clan(Member("#A", "Anna"));

        var war = ClanWar.From(clan, Race("someNewPeriod", 4, Played("#A", 1, 5)), NoHistory, Now);

        Assert.True(war.IsBattleDay);
        Assert.True(war.IsPeriodGuessed);
        Assert.Equal(3, war.DecksLeftToday);
    }

    [Fact]
    public void ColosseumDays_AreBattleDays()
    {
        var clan = Clan(Member("#A", "Anna"));

        var war = ClanWar.From(clan, Race("colosseum", 5, Played("#A", 1, 9)), NoHistory, Now);

        Assert.True(war.IsBattleDay);
        Assert.Equal(3, war.Members[0].DecksLeftToday);
    }

    [Fact]
    public void OnATrainingDay_NobodyHasDecksLeft_AndLastWeeksWeakestComeFirst()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "Bob"), Member("#NEW", "Newcomer"), Member("#C", "Cees"));
        var log = new CrRiverRaceLog([Week(2, 3, 20_000, Played("#A", 0, 16), Played("#B", 0, 4), Played("#C", 0, 12))]);

        var war = ClanWar.From(clan, Race("training", 1), log, Now);

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
            Week(3, 2, 10_000, Played("#A", 0, 16, fame: 3_000), Played("#B", 0, 10, fame: 1_800)),
            Week(2, 4, 6_400, Played("#A", 0, 12, fame: 2_250)),
        ]);

        var war = ClanWar.From(clan, Race("warDay", 3), log, Now);

        Assert.Equal(
            [new PastWarWeek(137, 4, 2, 4_800, new DateTimeOffset(2026, 11, 2, 9, 39, 5, TimeSpan.Zero)), new PastWarWeek(137, 3, 4, 2_250, new DateTimeOffset(2026, 11, 2, 9, 39, 5, TimeSpan.Zero))],
            war.PastWeeks);
        Assert.Equal([16, 12], war.Members.Single(m => m.Tag == "#A").DecksUsedPastWeeks);
        Assert.Equal([10, null], war.Members.Single(m => m.Tag == "#B").DecksUsedPastWeeks);
    }

    [Fact]
    public void LogEntriesWithoutThisClan_AreLeftOut()
    {
        var other = new CrRiverRaceLogEntry(137, 1, null, [new CrRiverRaceStanding(1, RaceClan("#OTHER", 1))]);

        var war = ClanWar.From(Clan(Member("#A", "Anna")), Race("warDay", 3), new CrRiverRaceLog([other]), Now);

        Assert.Empty(war.PastWeeks);
        Assert.Empty(war.Members[0].DecksUsedPastWeeks);
    }

    [Fact]
    public void PlayersWhoLeft_AreNotMembers()
    {
        var clan = Clan(Member("#A", "Anna"));
        var race = Race("warDay", 4, Played("#A", 2, 6), Played("#GONE", 0, 4), Played("#IDLE", 0, 0));

        var war = ClanWar.From(clan, race, NoHistory, Now);

        Assert.Equal(["#A"], war.Members.Select(m => m.Tag));
    }

    [Fact]
    public void AMemberMissingFromTheRace_HasPlayedNothing()
    {
        var war = ClanWar.From(Clan(Member("#A", "Anna", "coLeader")), Race("warDay", 3), NoHistory, Now);

        var member = Assert.Single(war.Members);
        Assert.Equal(0, member.DecksUsedToday);
        Assert.Equal(0, member.DecksUsedThisWeek);
        Assert.Equal(4, member.DecksLeftToday);
        Assert.Equal(ClanRole.CoLeader, member.Role);
        Assert.Equal(new DateTimeOffset(2026, 11, 6, 15, 41, 47, TimeSpan.Zero), member.LastSeen);
    }

    [Fact]
    public void PastWeeks_KeepEachMembersFame()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "Bob"));
        var log = new CrRiverRaceLog([Week(3, 2, 30_000, Played("#A", 0, 16, fame: 3_200))]);

        var war = ClanWar.From(clan, Race("training", 0), log, Now);

        Assert.Equal([3_200], war.Members.Single(m => m.Tag == "#A").FamePastWeeks);
        Assert.Equal([null], war.Members.Single(m => m.Tag == "#B").FamePastWeeks);
    }

    [Fact]
    public void TheRace_ListsEveryClanByBoatDistance_WithTodaysMedals()
    {
        var race = Race("warDay", 4) with
        {
            Clans = [RaceClan("#SLOW", 800, 22_950), RaceClan(ClanTagValue, 3_435, 9_950), RaceClan("#MID", 2_212, 16_000)],
        };

        var war = ClanWar.From(Clan(), race, NoHistory, Now);

        Assert.Equal([ClanTagValue, "#MID", "#SLOW"], war.Race.Select(c => c.Tag));
        Assert.Equal(22_950, war.Race[2].MedalsToday);
    }

    [Theory]
    [InlineData(8, 0, "2026-11-06T09:39:05Z")]
    [InlineData(9, 39, "2026-11-06T09:39:05Z")]
    [InlineData(9, 40, "2026-11-07T09:39:05Z")]
    public void TheDayEnds_AtTheMinuteThePastRacesEnded(int hour, int minute, string expected)
    {
        var now = new DateTimeOffset(2026, 11, 6, hour, minute, 0, TimeSpan.Zero);
        var log = new CrRiverRaceLog([Week(3, 1, 10_000)]);

        var war = ClanWar.From(Clan(), Race("warDay", 4), log, now);

        Assert.Equal(DateTimeOffset.Parse(expected), war.DayEndsAt);
        Assert.Null(war.WarStartsAt);
    }

    [Fact]
    public void OnATrainingDay_TheWarStartsWhenTheLastTrainingDayEnds()
    {
        var log = new CrRiverRaceLog([Week(3, 1, 10_000)]);

        var war = ClanWar.From(Clan(), Race("training", 0), log, Now);

        Assert.Equal(new DateTimeOffset(2026, 11, 8, 9, 39, 5, TimeSpan.Zero), war.WarStartsAt);
    }

    [Fact]
    public void WithoutPastRaces_ThereIsNoResetToEstimateFrom()
    {
        var war = ClanWar.From(Clan(), Race("training", 0), NoHistory, Now);

        Assert.Null(war.DayEndsAt);
        Assert.Null(war.WarStartsAt);
    }

    [Fact]
    public void AClanOutsideARiverRace_StillListsItsMembersByPastWeeks()
    {
        var clan = Clan(Member("#A", "Anna"), Member("#B", "Bob"));
        var log = new CrRiverRaceLog([Week(2, 3, 20_000, Played("#A", 0, 16), Played("#B", 0, 4))]);

        var war = ClanWar.From(clan, null, log, Now);

        Assert.Equal(WarPeriod.NotRacing, war.Period);
        Assert.False(war.IsBattleDay);
        Assert.Equal(0, war.Day);
        Assert.Empty(war.Race);
        Assert.Null(war.DayEndsAt);
        Assert.Null(war.WarStartsAt);
        Assert.Equal(0, war.DecksLeftToday);
        Assert.Equal(["#B", "#A"], war.Members.Select(m => m.Tag));
    }
}
