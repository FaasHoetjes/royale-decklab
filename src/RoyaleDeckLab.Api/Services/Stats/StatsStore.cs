using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using Microsoft.Data.Sqlite;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <param name="Visitor">An HMAC of the visitor's IP address and browser with the month's secret.</param>
/// <param name="Tag">An HMAC of the player tag with the same secret, or empty.</param>
public sealed record StatsEvent(
    long AtMs, string Kind, byte[] Visitor, byte[] Tag, string Tool, string? Country, string? Device, string? Source);

public sealed record StatsTotal(string Metric, string Dim, long Value);

/// <summary>
/// The usage stats in their own SQLite file, apart from the rebuildable meta. Events are kept for
/// <see cref="RetentionDays"/> days, then summed into daily and monthly totals that are kept for good.
/// </summary>
public sealed class StatsStore
{
    public const int RetentionDays = 90;
    public static readonly TimeSpan ConversionWindow = TimeSpan.FromDays(7);

    public static class Kinds
    {
        public const string Lookup = "lookup";
        public const string ShareOpen = "share_open";
        public const string ShareTap = "share";
        public const string Tool = "tool";
        public const string Preview = "preview";
    }

    private const string Range = "day BETWEEN @from AND @to";

    // Anyone who opened a page; previews come from the sites fetching a link, not from people.
    private const string Visit = "kind <> 'preview'";

    private static readonly (string Metric, string Sql)[] Scalars =
    [
        ("users", $"SELECT COUNT(DISTINCT visitor) FROM events WHERE kind = 'lookup' AND {Range}"),
        ("visitors", $"SELECT COUNT(DISTINCT visitor) FROM events WHERE {Visit} AND {Range}"),
        ("lookups", $"SELECT COUNT(*) FROM events WHERE kind = 'lookup' AND {Range}"),
        ("players", $"SELECT COUNT(DISTINCT tag) FROM events WHERE kind = 'lookup' AND {Range}"),
        ("returning", $"SELECT COUNT(*) FROM (SELECT visitor FROM events WHERE kind = 'lookup' AND {Range} GROUP BY visitor HAVING COUNT(DISTINCT day) > 1)"),
        ("share_taps", $"SELECT COUNT(*) FROM events WHERE kind = 'share' AND {Range}"),
        ("previews", $"SELECT COUNT(*) FROM events WHERE kind = 'preview' AND {Range}"),
        ("share_opens", $"SELECT COUNT(*) FROM events WHERE kind = 'share_open' AND {Range}"),
        // A friend who opened a shared lineup and then looked up a different player, their own, having looked up
        // no one else before it.
        ("new_from_share",
            $"""
            SELECT COUNT(DISTINCT o.visitor) FROM events o
            WHERE o.kind = 'share_open' AND o.{Range}
              AND EXISTS (SELECT 1 FROM events l WHERE l.visitor = o.visitor AND l.kind = 'lookup' AND l.tag <> o.tag
                          AND l.at_ms >= o.at_ms AND l.at_ms <= o.at_ms + @window)
              AND NOT EXISTS (SELECT 1 FROM events p WHERE p.visitor = o.visitor AND p.kind = 'lookup' AND p.tag <> o.tag
                              AND p.at_ms < o.at_ms)
            """),
    ];

    private static readonly (string Metric, string Sql)[] Groups =
    [
        ("daily_users", $"SELECT day, COUNT(DISTINCT visitor) FROM events WHERE kind = 'lookup' AND {Range} GROUP BY day"),
        ("country", $"SELECT COALESCE(country, 'XX'), COUNT(DISTINCT visitor) FROM events WHERE {Visit} AND {Range} GROUP BY 1"),
        ("device", $"SELECT COALESCE(device, 'desktop'), COUNT(DISTINCT visitor) FROM events WHERE kind = 'lookup' AND {Range} GROUP BY 1"),
        ("source", $"SELECT COALESCE(source, 'direct'), COUNT(DISTINCT visitor) FROM events WHERE {Visit} AND {Range} GROUP BY 1"),
        ("tool", $"SELECT tool, COUNT(DISTINCT visitor) FROM events WHERE kind = 'tool' AND {Range} GROUP BY tool"),
    ];

    private readonly string _connectionString;
    private readonly ConcurrentDictionary<string, byte[]> _secrets = new();
    private bool _checkpointPending;

    public StatsStore(string path)
    {
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var connection = Open();
        Execute(connection, "PRAGMA journal_mode=WAL;");
        Execute(connection,
            """
            CREATE TABLE IF NOT EXISTS secrets (
                month TEXT NOT NULL PRIMARY KEY,
                key BLOB NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                day TEXT NOT NULL,
                kind TEXT NOT NULL,
                visitor BLOB NOT NULL,
                tag BLOB NOT NULL,
                tool TEXT NOT NULL,
                at_ms INTEGER NOT NULL,
                country TEXT,
                device TEXT,
                source TEXT,
                PRIMARY KEY (day, kind, visitor, tag, tool)
            ) WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS events_by_visitor ON events (visitor, kind, at_ms);
            CREATE TABLE IF NOT EXISTS totals (
                period TEXT NOT NULL,
                metric TEXT NOT NULL,
                dim TEXT NOT NULL,
                value INTEGER NOT NULL,
                PRIMARY KEY (period, metric, dim)
            ) WITHOUT ROWID;
            """);
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
            INSERT OR IGNORE INTO events (day, kind, visitor, tag, tool, at_ms, country, device, source)
            VALUES (@day, @kind, @visitor, @tag, @tool, @at, @country, @device, @source)
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
            insert.ExecuteNonQuery();
        }
        transaction.Commit();
    }

    /// <summary>Every metric over the stored events of the days from <paramref name="from"/> to <paramref name="to"/>.</summary>
    public IReadOnlyList<StatsTotal> Compute(DateOnly from, DateOnly to)
    {
        using var connection = Open();
        return Compute(connection, from, to);
    }

    /// <summary>One of the scalar metrics, such as "users" or "visitors", without computing the rest.</summary>
    public long Count(string metric, DateOnly from, DateOnly to)
    {
        using var connection = Open();
        using var command = RangeCommand(connection, Scalars.Single(s => s.Metric == metric).Sql, from, to);
        return (long)command.ExecuteScalar()!;
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
                SaveTotals(connection, transaction, Month(day), Compute(connection, first, first.AddMonths(1).AddDays(-1), transaction));
            }
            if (!HasTotals(connection, transaction, dayText))
            {
                SaveTotals(connection, transaction, dayText, Compute(connection, day, day, transaction));
            }
            using (var delete = Command(connection, "DELETE FROM events WHERE day = @day"))
            {
                delete.Transaction = transaction;
                delete.Parameters.AddWithValue("@day", dayText);
                delete.ExecuteNonQuery();
            }
            transaction.Commit();
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

    private static IReadOnlyList<StatsTotal> Compute(SqliteConnection connection, DateOnly from, DateOnly to, SqliteTransaction? transaction = null)
    {
        var totals = new List<StatsTotal>();
        foreach (var (metric, sql) in Scalars)
        {
            using var command = RangeCommand(connection, sql, from, to, transaction);
            totals.Add(new StatsTotal(metric, "", (long)command.ExecuteScalar()!));
        }
        foreach (var (metric, sql) in Groups)
        {
            using var command = RangeCommand(connection, sql, from, to, transaction);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                totals.Add(new StatsTotal(metric, reader.GetString(0), reader.GetInt64(1)));
            }
        }
        return totals;
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

    private static SqliteCommand RangeCommand(SqliteConnection connection, string sql, DateOnly from, DateOnly to, SqliteTransaction? transaction = null)
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

    private static SqliteCommand Command(SqliteConnection connection, string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        return command;
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = Command(connection, sql);
        command.ExecuteNonQuery();
    }
}
