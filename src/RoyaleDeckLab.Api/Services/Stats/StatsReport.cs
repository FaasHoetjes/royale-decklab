namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Everything the admin stats page shows, in one response so switching ranges needs no new request.</summary>
public static class StatsReport
{
    public sealed record Count(string Key, long Users);

    public sealed record RangeReport(
        string Key,
        string From,
        string To,
        bool SpansMonths,
        long Users,
        long? PreviousUsers,
        long Visitors,
        long? PreviousVisitors,
        long Lookups,
        long Players,
        long Returning,
        long ShareTaps,
        long Previews,
        long ShareOpens,
        long NewFromShare,
        IReadOnlyList<Count> Daily,
        IReadOnlyList<Count> Countries,
        IReadOnlyList<Count> Devices,
        IReadOnlyList<Count> Sources,
        IReadOnlyList<Count> Tools);

    public sealed record MonthReport(string Month, bool Partial, long Users, long Visitors, long Lookups, long Players, long ShareOpens, long NewFromShare);

    public sealed record Report(DateTimeOffset GeneratedAt, int RetentionDays, IReadOnlyList<RangeReport> Ranges, IReadOnlyList<MonthReport> Months);

    public static Report Build(StatsStore store, DateTimeOffset now)
    {
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var ranges = new List<RangeReport>
        {
            Range(store, "today", today, today, previous: null),
            Range(store, "7d", today.AddDays(-6), today, previous: (today.AddDays(-13), today.AddDays(-7))),
            Range(store, "30d", today.AddDays(-29), today, previous: (today.AddDays(-59), today.AddDays(-30))),
            Range(store, "90d", today.AddDays(-(StatsStore.RetentionDays - 1)), today, previous: null),
        };
        return new Report(now, StatsStore.RetentionDays, ranges, Months(store, today));
    }

    private static RangeReport Range(StatsStore store, string key, DateOnly from, DateOnly to, (DateOnly From, DateOnly To)? previous)
    {
        var totals = store.Compute(from, to);
        long Scalar(string metric) => totals.FirstOrDefault(t => t.Metric == metric)?.Value ?? 0;
        IReadOnlyList<Count> Group(string metric) => totals
            .Where(t => t.Metric == metric)
            .OrderByDescending(t => t.Value)
            .ThenBy(t => t.Dim, StringComparer.Ordinal)
            .Select(t => new Count(t.Dim, t.Value))
            .ToList();

        var perDay = totals.Where(t => t.Metric == "daily_users").ToDictionary(t => t.Dim, t => t.Value);
        var daily = new List<Count>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var text = StatsStore.Day(day);
            daily.Add(new Count(text, perDay.GetValueOrDefault(text)));
        }

        return new RangeReport(
            key,
            StatsStore.Day(from),
            StatsStore.Day(to),
            StatsStore.Month(from) != StatsStore.Month(to),
            Scalar("users"),
            previous is { } p ? store.Count("users", p.From, p.To) : null,
            Scalar("visitors"),
            previous is { } v ? store.Count("visitors", v.From, v.To) : null,
            Scalar("lookups"),
            Scalar("players"),
            Scalar("returning"),
            Scalar("share_taps"),
            Scalar("previews"),
            Scalar("share_opens"),
            Scalar("new_from_share"),
            daily,
            Group("country"),
            Group("device"),
            Group("source"),
            Group("tool"));
    }

    private static List<MonthReport> Months(StatsStore store, DateOnly today)
    {
        var months = store.StoredTotals(periodLength: 7)
            .Select(p => Month(p.Key, p.Value, partial: false))
            .ToDictionary(m => m.Month);
        var current = StatsStore.Month(today);
        foreach (var month in store.MonthsWithEvents().Where(m => !months.ContainsKey(m)))
        {
            var first = DateOnly.ParseExact(month + "-01", "yyyy-MM-dd");
            var last = first.AddMonths(1).AddDays(-1);
            months[month] = Month(month, store.Compute(first, last < today ? last : today), partial: month == current);
        }
        return [.. months.Values.OrderByDescending(m => m.Month, StringComparer.Ordinal)];
    }

    private static MonthReport Month(string month, IReadOnlyList<StatsTotal> totals, bool partial)
    {
        long Scalar(string metric) => totals.FirstOrDefault(t => t.Metric == metric && t.Dim == "")?.Value ?? 0;
        return new MonthReport(month, partial, Scalar("users"), Scalar("visitors"), Scalar("lookups"), Scalar("players"), Scalar("share_opens"), Scalar("new_from_share"));
    }
}
