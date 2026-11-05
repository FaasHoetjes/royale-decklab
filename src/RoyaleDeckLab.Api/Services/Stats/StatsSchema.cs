using Microsoft.Data.Sqlite;

namespace RoyaleDeckLab.Api.Services.Stats;

internal static class StatsSchema
{
    /// <summary>Creates the tables, and adds the columns that came after them to an older stats.db.</summary>
    public static void Ensure(SqliteConnection connection)
    {
        StatsStore.Execute(connection, "PRAGMA journal_mode=WAL;");
        StatsStore.Execute(connection,
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
                campaign TEXT,
                PRIMARY KEY (day, kind, visitor, tag, tool)
            ) WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS events_by_visitor ON events (visitor, kind, at_ms);
            CREATE TABLE IF NOT EXISTS time_in_view (
                day TEXT NOT NULL,
                visitor BLOB NOT NULL,
                ms INTEGER NOT NULL,
                PRIMARY KEY (day, visitor)
            ) WITHOUT ROWID;
            CREATE TABLE IF NOT EXISTS totals (
                period TEXT NOT NULL,
                metric TEXT NOT NULL,
                dim TEXT NOT NULL,
                value INTEGER NOT NULL,
                PRIMARY KEY (period, metric, dim)
            ) WITHOUT ROWID;
            """);
        using var campaignColumn = StatsStore.Command(connection, "SELECT 1 FROM pragma_table_info('events') WHERE name = 'campaign'");
        if (campaignColumn.ExecuteScalar() is null)
        {
            StatsStore.Execute(connection, "ALTER TABLE events ADD COLUMN campaign TEXT;");
        }
    }
}
