using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// A clan's river race as a leader plans it: who still has war decks to play today, and how each member did in
/// the last weeks. Members are sorted so the ones that need a nudge come first. DayEndsAt and WarStartsAt are
/// estimates, null for a clan without past races to estimate from.
/// </summary>
public sealed record ClanWar(
    string Tag,
    string Name,
    int? BadgeId,
    WarPeriod Period,
    int Day,
    IReadOnlyList<ClanWarMember> Members,
    IReadOnlyList<PastWarWeek> PastWeeks,
    IReadOnlyList<RaceClan> Race,
    DateTimeOffset? DayEndsAt,
    DateTimeOffset? WarStartsAt)
{
    public const int DecksPerDay = 4;
    public const int WarDays = 4;
    private const int TrainingDays = 3;
    private const int DaysPerWeek = TrainingDays + WarDays;

    public bool IsBattleDay => Period is WarPeriod.WarDay or WarPeriod.Colosseum;

    public int DecksLeftToday => Members.Sum(m => m.DecksLeftToday);

    public int MembersDoneToday => IsBattleDay ? Members.Count(m => m.DecksLeftToday == 0) : 0;

    /// <param name="race">Null when the clan isn't in a river race this week.</param>
    public static ClanWar From(ClanResponse clan, CrRiverRace? race, CrRiverRaceLog log, DateTimeOffset now)
    {
        var tag = clan.Tag ?? throw new FormatException("The clan response has no tag");
        var period = race is null ? WarPeriod.NotRacing : ParsePeriod(race.PeriodType);
        var isBattleDay = period is WarPeriod.WarDay or WarPeriod.Colosseum;
        var dayOfWeek = (race?.PeriodIndex ?? 0) % DaysPerWeek;
        var day = race is null ? 0 : isBattleDay ? dayOfWeek - TrainingDays + 1 : dayOfWeek + 1;

        var thisWeek = ParticipantsByTag(race?.Clan);
        var pastWeeks = PastWeeksOf(tag, log);

        var members = new List<ClanWarMember>();
        foreach (var member in clan.MemberList ?? [])
        {
            if (member.Tag is not { } memberTag)
            {
                continue;
            }
            members.Add(ToMember(member, memberTag, thisWeek, pastWeeks, isBattleDay));
        }

        var dayEndsAt = race is null ? null : NextReset(pastWeeks, now);
        var warStartsAt = race is null || isBattleDay ? null : dayEndsAt?.AddDays(TrainingDays - day);

        return new ClanWar(
            tag,
            DisplayName.Clean(clan.Name, tag),
            clan.BadgeId,
            period,
            day,
            Sort(members, isBattleDay),
            pastWeeks.Select(w => w.Week).ToList(),
            race is null ? [] : RaceOf(race),
            dayEndsAt,
            warStartsAt);
    }

    /// <summary>
    /// The CR API doesn't say when the day resets, but a clan's races end at the same minute every week, and its
    /// days reset at that minute too; the next time it is that minute is the next reset.
    /// </summary>
    private static DateTimeOffset? NextReset(IReadOnlyList<WeekResult> pastWeeks, DateTimeOffset now)
    {
        if (pastWeeks.FirstOrDefault()?.Week.EndedAt is not { } lastEnd)
        {
            return null;
        }
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var reset = today + lastEnd.UtcDateTime.TimeOfDay;
        return reset > now ? reset : reset.AddDays(1);
    }

    private static List<RaceClan> RaceOf(CrRiverRace race)
    {
        var clans = new List<RaceClan>();
        foreach (var clan in race.Clans ?? [])
        {
            if (clan.Tag is { } clanTag)
            {
                clans.Add(new RaceClan(clanTag, DisplayName.Clean(clan.Name, clanTag), clan.Fame, clan.PeriodPoints));
            }
        }
        return clans
            .OrderByDescending(c => c.Fame)
            .ThenByDescending(c => c.MedalsToday)
            .ToList();
    }

    private static WarPeriod ParsePeriod(string? periodType) => periodType switch
    {
        "training" => WarPeriod.Training,
        "warDay" => WarPeriod.WarDay,
        "colosseum" => WarPeriod.Colosseum,
        _ => throw new FormatException($"Unknown river race period type '{periodType}'"),
    };

    private static ClanRole ParseRole(string? role) => role switch
    {
        "leader" => ClanRole.Leader,
        "coLeader" => ClanRole.CoLeader,
        "elder" => ClanRole.Elder,
        _ => ClanRole.Member,
    };

    private static ClanWarMember ToMember(
        ClanMember member,
        string memberTag,
        IReadOnlyDictionary<string, CrRiverRaceParticipant> thisWeek,
        IReadOnlyList<WeekResult> pastWeeks,
        bool isBattleDay)
    {
        thisWeek.TryGetValue(memberTag, out var participant);
        var decksUsedToday = participant?.DecksUsedToday ?? 0;
        var decksLeftToday = isBattleDay ? Math.Max(0, DecksPerDay - decksUsedToday) : 0;

        var decksUsedPastWeeks = pastWeeks
            .Select(w => w.Participants.TryGetValue(memberTag, out var past) ? past.DecksUsed : (int?)null)
            .ToList();
        var famePastWeeks = pastWeeks
            .Select(w => w.Participants.TryGetValue(memberTag, out var past) ? past.Fame : (int?)null)
            .ToList();

        return new ClanWarMember(
            memberTag,
            DisplayName.Clean(member.Name, memberTag),
            ParseRole(member.Role),
            ApiTime.Parse(member.LastSeen),
            decksUsedToday,
            decksLeftToday,
            participant?.DecksUsed ?? 0,
            participant?.Fame ?? 0,
            decksUsedPastWeeks,
            famePastWeeks);
    }

    /// <summary>On a battle day, whoever has the most decks left; otherwise whoever played the fewest last week.</summary>
    private static List<ClanWarMember> Sort(List<ClanWarMember> members, bool isBattleDay)
    {
        var ordered = isBattleDay
            ? members.OrderByDescending(m => m.DecksLeftToday)
            : members.OrderBy(LastWeekSortKey);
        return ordered
            .ThenBy(m => m.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    /// <summary>Members who weren't in the clan last week go last: they had nothing to miss.</summary>
    private static int LastWeekSortKey(ClanWarMember member)
    {
        if (member.DecksUsedPastWeeks.Count == 0)
        {
            return int.MaxValue;
        }
        return member.DecksUsedPastWeeks[0] ?? int.MaxValue;
    }

    private static Dictionary<string, CrRiverRaceParticipant> ParticipantsByTag(CrRiverRaceClan? clan)
    {
        var participants = new Dictionary<string, CrRiverRaceParticipant>(StringComparer.Ordinal);
        foreach (var participant in clan?.Participants ?? [])
        {
            if (participant.Tag is { } tag)
            {
                participants[tag] = participant;
            }
        }
        return participants;
    }

    private sealed record WeekResult(PastWarWeek Week, IReadOnlyDictionary<string, CrRiverRaceParticipant> Participants);

    private static List<WeekResult> PastWeeksOf(string clanTag, CrRiverRaceLog log)
    {
        var weeks = new List<WeekResult>();
        foreach (var entry in log.Items ?? [])
        {
            var standing = entry.Standings?.FirstOrDefault(s => s.Clan?.Tag == clanTag);
            if (standing?.Clan is not { } clan)
            {
                continue;
            }
            var week = new PastWarWeek(
                entry.SeasonId,
                entry.SectionIndex + 1,
                standing.Rank,
                clan.Fame,
                ApiTime.Parse(entry.CreatedDate));
            weeks.Add(new WeekResult(week, ParticipantsByTag(clan)));
        }
        return weeks;
    }
}
