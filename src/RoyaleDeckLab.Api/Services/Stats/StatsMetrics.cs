using Microsoft.Data.Sqlite;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>What the stats measure: each metric as a query over a table of events, and the time in view.</summary>
internal static class StatsMetrics
{
    private static readonly HashSet<string> TimeMetrics = ["time_median", "time_mean", "time_visitors", "source_time", "source_time_visitors"];

    internal const string Range = "day BETWEEN @from AND @to";

    // Anyone who opened a page; previews come from the sites fetching a link, not from people.
    internal const string Visit = "kind <> 'preview'";

    private static readonly (string Metric, Func<string, string> Sql)[] Scalars =
    [
        ("users", t => $"SELECT COUNT(DISTINCT visitor) FROM {t} WHERE kind = 'lookup' AND {Range}"),
        ("visitors", t => $"SELECT COUNT(DISTINCT visitor) FROM {t} WHERE {Visit} AND {Range}"),
        ("lookups", t => $"SELECT COUNT(*) FROM {t} WHERE kind = 'lookup' AND {Range}"),
        ("players", t => $"SELECT COUNT(DISTINCT tag) FROM {t} WHERE kind = 'lookup' AND {Range}"),
        ("returning", t => $"SELECT COUNT(*) FROM (SELECT visitor FROM {t} WHERE kind = 'lookup' AND {Range} GROUP BY visitor HAVING COUNT(DISTINCT day) > 1)"),
        ("share_taps", t => $"SELECT COUNT(*) FROM {t} WHERE kind = 'share' AND {Range}"),
        ("previews", t => $"SELECT COUNT(*) FROM {t} WHERE kind = 'preview' AND {Range}"),
        ("share_opens", t => $"SELECT COUNT(*) FROM {t} WHERE kind = 'share_open' AND {Range}"),
        // A friend who opened a shared lineup and then looked up a different player, their own, having looked up
        // no one else before it.
        ("new_from_share", t =>
            $"""
            SELECT COUNT(DISTINCT o.visitor) FROM {t} o
            WHERE o.kind = 'share_open' AND o.{Range}
              AND EXISTS (SELECT 1 FROM {t} l WHERE l.visitor = o.visitor AND l.kind = 'lookup' AND l.tag <> o.tag
                          AND l.at_ms >= o.at_ms AND l.at_ms <= o.at_ms + @window)
              AND NOT EXISTS (SELECT 1 FROM {t} p WHERE p.visitor = o.visitor AND p.kind = 'lookup' AND p.tag <> o.tag
                              AND p.at_ms < o.at_ms)
            """),
    ];

    private static readonly (string Metric, Func<string, string> Sql)[] Groups =
    [
        ("daily_users", t => $"SELECT day, COUNT(DISTINCT visitor) FROM {t} WHERE kind = 'lookup' AND {Range} GROUP BY day"),
        ("daily_visitors", t => $"SELECT day, COUNT(DISTINCT visitor) FROM {t} WHERE {Visit} AND {Range} GROUP BY day"),
        ("country", t => $"SELECT COALESCE(country, 'XX'), COUNT(DISTINCT visitor) FROM {t} WHERE {Visit} AND {Range} GROUP BY 1"),
        ("country_users", t => LookedUpBy(t, "COALESCE(country, 'XX')")),
        ("device", t => $"SELECT COALESCE(device, 'desktop'), COUNT(DISTINCT visitor) FROM {t} WHERE kind = 'lookup' AND {Range} GROUP BY 1"),
        ("source", t => $"SELECT COALESCE(source, 'direct'), COUNT(DISTINCT visitor) FROM {t} WHERE {Visit} AND {Range} GROUP BY 1"),
        ("source_users", t => LookedUpBy(t, "COALESCE(source, 'direct')")),
        ("campaign", t => $"SELECT campaign, COUNT(DISTINCT visitor) FROM {t} WHERE {Visit} AND {Range} AND campaign IS NOT NULL GROUP BY 1"),
        ("tool", t => $"SELECT tool, COUNT(DISTINCT visitor) FROM {t} WHERE kind = 'tool' AND {Range} GROUP BY tool"),
    ];

    // Per value of the column: how many of the visitors who came with it looked up a player in the period.
    private static string LookedUpBy(string table, string column) =>
        $"""
        SELECT v.dim, COUNT(DISTINCT l.visitor) FROM {table} l
        JOIN (SELECT DISTINCT visitor, {column} AS dim FROM {table} WHERE {Visit} AND {Range}) v ON v.visitor = l.visitor
        WHERE l.kind = 'lookup' AND l.{Range}
        GROUP BY 1
        """;

    internal static IReadOnlyList<StatsTotal> Compute(
        SqliteConnection connection, string table, DateOnly from, DateOnly to, SqliteTransaction? transaction = null, IReadOnlySet<string>? metrics = null)
    {
        var totals = new List<StatsTotal>();
        foreach (var (metric, sql) in Scalars.Where(q => metrics is null || metrics.Contains(q.Metric)))
        {
            using var command = StatsStore.RangeCommand(connection, sql(table), from, to, transaction);
            totals.Add(new StatsTotal(metric, "", Convert.ToInt64(command.ExecuteScalar())));
        }
        foreach (var (metric, sql) in Groups.Where(q => metrics is null || metrics.Contains(q.Metric)))
        {
            using var command = StatsStore.RangeCommand(connection, sql(table), from, to, transaction);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                totals.Add(new StatsTotal(metric, reader.GetString(0), reader.GetInt64(1)));
            }
        }
        if (metrics is null || metrics.Overlaps(TimeMetrics))
        {
            totals.AddRange(TimeTotals(connection, table, from, to, transaction));
        }
        return totals;
    }

    /// <summary>
    /// Time in view, in seconds, of the period's visitors who have any: the median and mean overall, and the median
    /// per source they came from. Visitors from before it was measured have none, so they don't pull it to zero.
    /// </summary>
    private static List<StatsTotal> TimeTotals(SqliteConnection connection, string table, DateOnly from, DateOnly to, SqliteTransaction? transaction)
    {
        using var command = StatsStore.RangeCommand(connection,
            $"""
            SELECT t.visitor, v.source, t.ms
            FROM (SELECT visitor, SUM(ms) AS ms FROM time_in_view WHERE {Range} GROUP BY visitor) t
            JOIN (SELECT DISTINCT visitor, COALESCE(source, 'direct') AS source FROM {table} WHERE {Visit} AND {Range}) v
              ON v.visitor = t.visitor
            """, from, to, transaction);
        var perVisitor = new Dictionary<string, long>();
        var perSource = new Dictionary<string, List<long>>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                var ms = reader.GetInt64(2);
                perVisitor[Convert.ToHexString(reader.GetFieldValue<byte[]>(0))] = ms;
                var source = reader.GetString(1);
                if (!perSource.TryGetValue(source, out var list))
                {
                    perSource[source] = list = [];
                }
                list.Add(ms);
            }
        }

        var totals = new List<StatsTotal>();
        if (perVisitor.Count == 0)
        {
            return totals;
        }
        totals.Add(new StatsTotal("time_median", "", Seconds(Median(perVisitor.Values))));
        totals.Add(new StatsTotal("time_mean", "", Seconds(perVisitor.Values.Average())));
        totals.Add(new StatsTotal("time_visitors", "", perVisitor.Count));
        foreach (var (source, times) in perSource)
        {
            totals.Add(new StatsTotal("source_time", source, Seconds(Median(times))));
            totals.Add(new StatsTotal("source_time_visitors", source, times.Count));
        }
        return totals;
    }

    private static double Median(IEnumerable<long> values)
    {
        var sorted = values.Order().ToList();
        var middle = sorted.Count / 2;
        return sorted.Count % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2.0;
    }

    private static long Seconds(double ms) => (long)Math.Round(ms / 1000);
}
