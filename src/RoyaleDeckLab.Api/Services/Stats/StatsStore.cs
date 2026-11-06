using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>
/// The usage stats in their own SQLite file, apart from the rebuildable meta. Events are kept for
/// <see cref="RetentionDays"/> days, then summed into daily and monthly totals that are kept for good.
/// </summary>
public sealed class StatsStore
{
    public const int RetentionDays = 90;
    public static readonly TimeSpan ConversionWindow = TimeSpan.FromDays(7);

    /// <summary>Caps one visitor's time on the site in a day, however many screens they leave it open on.</summary>
    public static readonly TimeSpan MaxTimePerDay = TimeSpan.FromHours(4);

    public static class Kinds
    {
        public const string Lookup = "lookup";
        public const string ShareOpen = "share_open";
        public const string ShareTap = "share";
        public const string Tool = "tool";
        public const string Preview = "preview";
    }

    private readonly string _connectionString;
    private readonly ConcurrentDictionary<string, byte[]> _secrets = new();
    private bool _checkpointPending;

    public StatsStore(string path)
    {
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var connection = Open();
        StatsSchema.Ensure(connection);
    }

    public static string Day(DateOnly day) => day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    public static string Month(DateOnly day) => day.ToString("yyyy-MM", CultureInfo.InvariantCulture);
    public static DateOnly DayOf(long ms) => DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeMilliseconds(ms).UtcDateTime);

    /// <summary>The month's secret, made the first time the month needs one. It's deleted once the month is over.</summary>
    public byte[] SecretFor(string month) => _secrets.GetOrAdd(month, m =>
    {
        using var connection = Open();
        using (var insert = Command(connection, "INSERT OR IGNORE INTO secrets (month, key) VALUES (@month, @key)"))
        {
            insert.Parameters.AddWithValue("@month", m);
            insert.Parameters.AddWithValue("@key", RandomNumberGenerator.GetBytes(32));
            insert.ExecuteNonQuery();
        }
        using var select = Command(connection, "SELECT key FROM secrets WHERE month = @month");
        select.Parameters.AddWithValue("@month", m);
        return (byte[])select.ExecuteScalar()!;
    });

    /// <summary>Stores the events; one that repeats a visitor's event of the same kind that day is ignored.</summary>
    public void Add(IReadOnlyList<StatsEvent> events)
    {
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        using var insert = Command(connection,
            """
            INSERT OR IGNORE INTO events (day, kind, visitor, tag, tool, at_ms, country, device, source, campaign)
            VALUES (@day, @kind, @visitor, @tag, @tool, @at, @country, @device, @source, @campaign)
            """);
        insert.Transaction = transaction;
        foreach (var e in events)
        {
            insert.Parameters.Clear();
            insert.Parameters.AddWithValue("@day", Day(DayOf(e.AtMs)));
            insert.Parameters.AddWithValue("@kind", e.Kind);
            insert.Parameters.AddWithValue("@visitor", e.Visitor);
            insert.Parameters.AddWithValue("@tag", e.Tag);
            insert.Parameters.AddWithValue("@tool", e.Tool);
            insert.Parameters.AddWithValue("@at", e.AtMs);
            insert.Parameters.AddWithValue("@country", (object?)e.Country ?? DBNull.Value);
            insert.Parameters.AddWithValue("@device", (object?)e.Device ?? DBNull.Value);
            insert.Parameters.AddWithValue("@source", (object?)e.Source ?? DBNull.Value);
            insert.Parameters.AddWithValue("@campaign", (object?)e.Campaign ?? DBNull.Value);
            insert.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    public void AddTime(IReadOnlyList<VisitTime> times)
    {
        if (times.Count == 0)
        {
            return;
        }
        using var connection = Open();
        using var transaction = connection.BeginTransaction();
        using var upsert = Command(connection,
            """
            INSERT INTO time_in_view (day, visitor, ms) VALUES (@day, @visitor, MIN(@ms, @cap))
            ON CONFLICT (day, visitor) DO UPDATE SET ms = MIN(ms + excluded.ms, @cap)
            """);
        upsert.Transaction = transaction;
        foreach (var time in times)
        {
            upsert.Parameters.Clear();
            upsert.Parameters.AddWithValue("@day", Day(time.Day));
            upsert.Parameters.AddWithValue("@visitor", time.Visitor);
            upsert.Parameters.AddWithValue("@ms", time.Ms);
            upsert.Parameters.AddWithValue("@cap", (long)MaxTimePerDay.TotalMilliseconds);
            upsert.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    /// <summary>Deletes everything stored under the visitor's code: the admin's own visits from before their browser was excluded.</summary>
    public void Forget(byte[] visitor)
    {
        using var connection = Open();
        foreach (var table in new[] { "events", "time_in_view" })
        {
            using var delete = Command(connection, $"DELETE FROM {table} WHERE visitor = @visitor");
            delete.Parameters.AddWithValue("@visitor", visitor);
            delete.ExecuteNonQuery();
        }
    }

    /// <summary>
    /// Every metric over the stored events of the days from <paramref name="from"/> to <paramref name="to"/>, or
    /// just the <paramref name="metrics"/> named.
    /// </summary>
    public IReadOnlyList<StatsTotal> Compute(DateOnly from, DateOnly to, StatsFilter? filter = null, IReadOnlySet<string>? metrics = null)
    {
        using var connection = Open();
        return WithEvents(connection, from, to, filter, table => StatsMetrics.Compute(connection, table, from, to, metrics: metrics));
    }

    /// <summary>The day's visitors and real users by the UTC hour they first showed up in, each counted once.</summary>
    public IReadOnlyList<StatsHour> Hourly(DateOnly day, StatsFilter? filter = null)
    {
        using var connection = Open();
        return WithEvents(connection, day, day, filter, table =>
        {
            using var command = RangeCommand(connection,
                $"""
                SELECT hour, COUNT(*), SUM(looked_up) FROM (
                    SELECT strftime('%H', MIN(at_ms) / 1000, 'unixepoch') AS hour, MAX(kind = 'lookup') AS looked_up
                    FROM {table} WHERE {StatsMetrics.Visit} AND {StatsMetrics.Range} GROUP BY visitor)
                GROUP BY hour
                """, day, day);
            var hours = new List<StatsHour>();
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                hours.Add(new StatsHour(reader.GetString(0), reader.GetInt64(2), reader.GetInt64(1)));
            }
            return hours;
        });
    }

    /// <summary>Totals kept for a day ("2026-11-05") or a month ("2026-11").</summary>
    public IReadOnlyDictionary<string, IReadOnlyList<StatsTotal>> StoredTotals(int periodLength)
    {
        using var connection = Open();
        using var command = Command(connection, "SELECT period, metric, dim, value FROM totals WHERE length(period) = @length ORDER BY period");
        command.Parameters.AddWithValue("@length", periodLength);
        var byPeriod = new Dictionary<string, List<StatsTotal>>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            var period = reader.GetString(0);
            if (!byPeriod.TryGetValue(period, out var list))
            {
                byPeriod[period] = list = [];
            }
            list.Add(new StatsTotal(reader.GetString(1), reader.GetString(2), reader.GetInt64(3)));
        }
        return byPeriod.ToDictionary(p => p.Key, p => (IReadOnlyList<StatsTotal>)p.Value);
    }

    /// <summary>Months that still have their events, oldest first.</summary>
    public IReadOnlyList<string> MonthsWithEvents()
    {
        using var connection = Open();
        using var command = Command(connection, "SELECT DISTINCT substr(day, 1, 7) FROM events ORDER BY 1");
        var months = new List<string>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            months.Add(reader.GetString(0));
        }
        return months;
    }

    /// <summary>
    /// Sums each day that falls out of the retention window into totals and deletes its events, and deletes past
    /// months' secrets. A month is summed just before its first day goes, while all of its events are still there.
    /// </summary>
    public void Maintain(DateOnly today)
    {
        using var connection = Open();
        var cutoff = Day(today.AddDays(-(RetentionDays - 1)));
        var expired = new List<string>();
        var deleted = false;
        using (var days = Command(connection, "SELECT DISTINCT day FROM events WHERE day < @cutoff ORDER BY day"))
        {
            days.Parameters.AddWithValue("@cutoff", cutoff);
            using var reader = days.ExecuteReader();
            while (reader.Read())
            {
                expired.Add(reader.GetString(0));
            }
        }

        foreach (var dayText in expired)
        {
            deleted = true;
            var day = DateOnly.ParseExact(dayText, "yyyy-MM-dd", CultureInfo.InvariantCulture);
            var first = new DateOnly(day.Year, day.Month, 1);
            using var transaction = connection.BeginTransaction();
            if (!HasTotals(connection, transaction, Month(day)))
            {
                SaveTotals(connection, transaction, Month(day), StatsMetrics.Compute(connection, "events", first, first.AddMonths(1).AddDays(-1), transaction));
            }
            if (!HasTotals(connection, transaction, dayText))
            {
                SaveTotals(connection, transaction, dayText, StatsMetrics.Compute(connection, "events", day, day, transaction));
            }
            foreach (var table in new[] { "events", "time_in_view" })
            {
                using var delete = Command(connection, $"DELETE FROM {table} WHERE day = @day");
                delete.Transaction = transaction;
                delete.Parameters.AddWithValue("@day", dayText);
                delete.ExecuteNonQuery();
            }
            transaction.Commit();
        }
        using (var strays = Command(connection, "DELETE FROM time_in_view WHERE day < @cutoff"))
        {
            strays.Parameters.AddWithValue("@cutoff", cutoff);
            deleted |= strays.ExecuteNonQuery() > 0;
        }

        var month = Month(today);
        using (var secrets = Command(connection, "DELETE FROM secrets WHERE month < @month"))
        {
            secrets.Parameters.AddWithValue("@month", month);
            deleted |= secrets.ExecuteNonQuery() > 0;
        }
        foreach (var key in _secrets.Keys.Where(k => string.CompareOrdinal(k, month) < 0))
        {
            _secrets.TryRemove(key, out _);
        }

        // secure_delete zeroes freed bytes in the database, but deleted rows stay in the WAL until it's checkpointed.
        // TRUNCATE also empties the WAL file; if readers block it, the next run tries again.
        if (deleted || _checkpointPending)
        {
            using var checkpoint = Command(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
            using var reader = checkpoint.ExecuteReader();
            _checkpointPending = reader.Read() && reader.GetInt64(0) != 0;
        }
    }

    /// <summary>
    /// Runs the query on the events table or, with a filter, on a temporary copy of the events of the visitors it
    /// matches in the period. The copy keeps all of their events, since some metrics look outside the period.
    /// </summary>
    private static T WithEvents<T>(SqliteConnection connection, DateOnly from, DateOnly to, StatsFilter? filter, Func<string, T> query)
    {
        if (filter is null || filter.IsEmpty)
        {
            return query("events");
        }
        // Pooled connections keep their temp tables, so one left behind by a failed request is dropped first.
        Execute(connection, "DROP TABLE IF EXISTS temp.filtered;");
        using (var copy = RangeCommand(connection,
            $"""
            CREATE TEMP TABLE filtered AS SELECT * FROM events WHERE visitor IN (
                SELECT visitor FROM events WHERE {StatsMetrics.Visit} AND {StatsMetrics.Range}
                  AND (@source IS NULL OR COALESCE(source, 'direct') = @source)
                  AND (@country IS NULL OR COALESCE(country, 'XX') = @country)
                  AND (@device IS NULL OR COALESCE(device, 'desktop') = @device))
            """, from, to))
        {
            copy.Parameters.AddWithValue("@source", (object?)filter.Source ?? DBNull.Value);
            copy.Parameters.AddWithValue("@country", (object?)filter.Country ?? DBNull.Value);
            copy.Parameters.AddWithValue("@device", (object?)filter.Device ?? DBNull.Value);
            copy.ExecuteNonQuery();
        }
        try
        {
            Execute(connection, "CREATE INDEX temp.filtered_by_visitor ON filtered (visitor, kind, at_ms);");
            return query("temp.filtered");
        }
        finally
        {
            Execute(connection, "DROP TABLE IF EXISTS temp.filtered;");
        }
    }

    private static bool HasTotals(SqliteConnection connection, SqliteTransaction transaction, string period)
    {
        using var command = Command(connection, "SELECT EXISTS (SELECT 1 FROM totals WHERE period = @period)");
        command.Transaction = transaction;
        command.Parameters.AddWithValue("@period", period);
        return (long)command.ExecuteScalar()! == 1;
    }

    private static void SaveTotals(SqliteConnection connection, SqliteTransaction transaction, string period, IReadOnlyList<StatsTotal> totals)
    {
        using var insert = Command(connection, "INSERT OR REPLACE INTO totals (period, metric, dim, value) VALUES (@period, @metric, @dim, @value)");
        insert.Transaction = transaction;
        foreach (var total in totals)
        {
            insert.Parameters.Clear();
            insert.Parameters.AddWithValue("@period", period);
            insert.Parameters.AddWithValue("@metric", total.Metric);
            insert.Parameters.AddWithValue("@dim", total.Dim);
            insert.Parameters.AddWithValue("@value", total.Value);
            insert.ExecuteNonQuery();
        }
    }

    internal static SqliteCommand RangeCommand(SqliteConnection connection, string sql, DateOnly from, DateOnly to, SqliteTransaction? transaction = null)
    {
        var command = Command(connection, sql);
        command.Transaction = transaction;
        command.Parameters.AddWithValue("@from", Day(from));
        command.Parameters.AddWithValue("@to", Day(to));
        if (sql.Contains("@window", StringComparison.Ordinal))
        {
            command.Parameters.AddWithValue("@window", (long)ConversionWindow.TotalMilliseconds);
        }
        return command;
    }

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        Execute(connection, "PRAGMA busy_timeout=5000;");
        Execute(connection, "PRAGMA secure_delete=ON;");
        return connection;
    }

    internal static SqliteCommand Command(SqliteConnection connection, string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        return command;
    }

    internal static void Execute(SqliteConnection connection, string sql)
    {
        using var command = Command(connection, sql);
        command.ExecuteNonQuery();
    }
}
