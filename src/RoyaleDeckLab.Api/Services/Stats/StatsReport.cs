using System.Globalization;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Everything the admin stats page shows, in one response so switching ranges needs no new request.</summary>
public static class StatsReport
{
    public sealed record Count(string Key, long Users);

    public sealed record Point(string Key, long Users, long Visitors);

    /// <summary>The median time in view, in seconds, of the visitors that came with the key.</summary>
    public sealed record Duration(string Key, long Seconds, long Visitors);

    public sealed record RangeReport(
        string Key,
        string From,
        string To,
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
        long? TimeMedian,
        long? PreviousTimeMedian,
        long? TimeMean,
        long TimeVisitors,
        IReadOnlyList<Duration> SourceTime,
        IReadOnlyList<Point> Daily,
        IReadOnlyList<Point>? PreviousDaily,
        IReadOnlyList<Point>? Hourly,
        IReadOnlyList<Count> Countries,
        IReadOnlyList<Count> CountryUsers,
        IReadOnlyList<Count> Devices,
        IReadOnlyList<Count> Sources,
        IReadOnlyList<Count> SourceUsers,
        IReadOnlyList<Count> Campaigns,
        IReadOnlyList<Count> Tools);

    public sealed record MonthReport(
        string Month, bool Partial, long Users, long Visitors, long Lookups, long Players, long ShareOpens, long NewFromShare, long? TimeMedian);

    public sealed record Report(
        DateTimeOffset GeneratedAt,
        int RetentionDays,
        int InView,
        StatsFilter Filters,
        IReadOnlyList<RangeReport> Ranges,
        IReadOnlyList<MonthReport> Months);

    private static readonly IReadOnlySet<string> TrendMetrics = new HashSet<string> { "users", "visitors", "daily_users", "daily_visitors", "time_median" };

    /// <param name="filter">Applies to the ranges; the months are always the whole site.</param>
    public static Report Build(StatsStore store, DateTimeOffset now, StatsFilter? filter = null, int inView = 0)
    {
        filter ??= new StatsFilter();
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        var ranges = new List<RangeReport>
        {
            Range(store, filter, "today", today, today, hasPrevious: false, hourlyUntil: now.UtcDateTime.Hour),
            Range(store, filter, "7d", today.AddDays(-6), today, hasPrevious: true),
            Range(store, filter, "30d", today.AddDays(-29), today, hasPrevious: true),
            Range(store, filter, "90d", today.AddDays(-(StatsStore.RetentionDays - 1)), today, hasPrevious: false),
        };
        return new Report(now, StatsStore.RetentionDays, inView, filter, ranges, Months(store, today));
    }

    private static RangeReport Range(StatsStore store, StatsFilter filter, string key, DateOnly from, DateOnly to, bool hasPrevious, int? hourlyUntil = null)
    {
        var totals = store.Compute(from, to, filter);
        long Scalar(string metric) => totals.FirstOrDefault(t => t.Metric == metric)?.Value ?? 0;
        IReadOnlyList<Count> Group(string metric) => totals
            .Where(t => t.Metric == metric)
            .OrderByDescending(t => t.Value)
            .ThenBy(t => t.Dim, StringComparer.Ordinal)
            .Select(t => new Count(t.Dim, t.Value))
            .ToList();

        IReadOnlyList<StatsTotal>? previous = null;
        var length = to.DayNumber - from.DayNumber + 1;
        if (hasPrevious)
        {
            previous = store.Compute(from.AddDays(-length), from.AddDays(-1), filter, TrendMetrics);
        }

        return new RangeReport(
            key,
            StatsStore.Day(from),
            StatsStore.Day(to),
            Scalar("users"),
            previous is null ? null : ScalarOf(previous, "users"),
            Scalar("visitors"),
            previous is null ? null : ScalarOf(previous, "visitors"),
            Scalar("lookups"),
            Scalar("players"),
            Scalar("returning"),
            Scalar("share_taps"),
            Scalar("previews"),
            Scalar("share_opens"),
            Scalar("new_from_share"),
            OptionalScalarOf(totals, "time_median"),
            previous is null ? null : OptionalScalarOf(previous, "time_median"),
            OptionalScalarOf(totals, "time_mean"),
            Scalar("time_visitors"),
            SourceTime(totals),
            Daily(totals, from, to),
            previous is null ? null : Daily(previous, from.AddDays(-length), from.AddDays(-1)),
            hourlyUntil is { } hour ? Hourly(store.Hourly(from, filter), hour) : null,
            Group("country"),
            Group("country_users"),
            Group("device"),
            Group("source"),
            Group("source_users"),
            Group("campaign"),
            Group("tool"));
    }

    private static long ScalarOf(IReadOnlyList<StatsTotal> totals, string metric)
        => totals.FirstOrDefault(t => t.Metric == metric && t.Dim == "")?.Value ?? 0;

    // Time in view is missing, not zero, for a period nobody's time was measured in.
    private static long? OptionalScalarOf(IReadOnlyList<StatsTotal> totals, string metric)
        => totals.FirstOrDefault(t => t.Metric == metric && t.Dim == "")?.Value;

    private static List<Duration> SourceTime(IReadOnlyList<StatsTotal> totals)
    {
        var visitors = totals
            .Where(t => t.Metric == "source_time_visitors")
            .ToDictionary(t => t.Dim, t => t.Value);
        return [.. totals
            .Where(t => t.Metric == "source_time")
            .Select(t => new Duration(t.Dim, t.Value, visitors.GetValueOrDefault(t.Dim)))
            .OrderByDescending(d => d.Visitors)
            .ThenBy(d => d.Key, StringComparer.Ordinal)];
    }

    private static List<Point> Daily(IReadOnlyList<StatsTotal> totals, DateOnly from, DateOnly to)
    {
        var users = totals.Where(t => t.Metric == "daily_users").ToDictionary(t => t.Dim, t => t.Value);
        var visitors = totals.Where(t => t.Metric == "daily_visitors").ToDictionary(t => t.Dim, t => t.Value);
        var daily = new List<Point>();
        for (var day = from; day <= to; day = day.AddDays(1))
        {
            var text = StatsStore.Day(day);
            daily.Add(new Point(text, users.GetValueOrDefault(text), visitors.GetValueOrDefault(text)));
        }
        return daily;
    }

    private static List<Point> Hourly(IReadOnlyList<StatsHour> hours, int until)
    {
        var byHour = hours.ToDictionary(h => h.Hour);
        return [.. Enumerable.Range(0, until + 1).Select(h =>
        {
            var key = h.ToString("00", CultureInfo.InvariantCulture);
            return byHour.TryGetValue(key, out var hour) ? new Point(key, hour.Users, hour.Visitors) : new Point(key, 0, 0);
        })];
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
        => new(month, partial, ScalarOf(totals, "users"), ScalarOf(totals, "visitors"), ScalarOf(totals, "lookups"),
            ScalarOf(totals, "players"), ScalarOf(totals, "share_opens"), ScalarOf(totals, "new_from_share"),
            OptionalScalarOf(totals, "time_median"));
}
