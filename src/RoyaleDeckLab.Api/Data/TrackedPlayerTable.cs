using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Data;

public static class TrackedPlayerTable
{
    private static string CreateSql(string table) =>
        $"""
        CREATE TABLE IF NOT EXISTS {table} (
            tag TEXT NOT NULL PRIMARY KEY,
            group_key INTEGER NOT NULL,
            next_read_ms INTEGER NOT NULL,
            last_seen_ms INTEGER NOT NULL,
            newest_battle_ms INTEGER NOT NULL,
            wait_ms INTEGER NOT NULL
        ) WITHOUT ROWID;
        """;

    public static void Save<TGroup>(
        SqliteConnection connection, SqliteTransaction transaction, string table,
        IReadOnlyCollection<TrackedPlayer<TGroup>> players, Func<TGroup, long> groupKey) where TGroup : struct
    {
        using var clear = connection.CreateCommand();
        clear.Transaction = transaction;
        clear.CommandText = CreateSql(table) + $"DELETE FROM {table};";
        clear.ExecuteNonQuery();

        using var insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText =
            $"""
            INSERT INTO {table} (tag, group_key, next_read_ms, last_seen_ms, newest_battle_ms, wait_ms)
            VALUES ($tag, $group, $next, $seen, $newest, $wait)
            """;
        var tag = insert.Parameters.Add("$tag", SqliteType.Text);
        var group = insert.Parameters.Add("$group", SqliteType.Integer);
        var next = insert.Parameters.Add("$next", SqliteType.Integer);
        var seen = insert.Parameters.Add("$seen", SqliteType.Integer);
        var newest = insert.Parameters.Add("$newest", SqliteType.Integer);
        var wait = insert.Parameters.Add("$wait", SqliteType.Integer);
        foreach (var player in players)
        {
            tag.Value = player.Tag;
            group.Value = groupKey(player.Group);
            next.Value = player.NextReadMs;
            seen.Value = player.LastSeenMs;
            newest.Value = player.NewestBattleMs;
            wait.Value = player.WaitMs;
            insert.ExecuteNonQuery();
        }
    }

    public static IReadOnlyList<TrackedPlayer<TGroup>> Load<TGroup>(
        SqliteConnection connection, string table, Func<long, TGroup> groupOf) where TGroup : struct
    {
        using (var create = connection.CreateCommand())
        {
            create.CommandText = CreateSql(table);
            create.ExecuteNonQuery();
        }
        using var select = connection.CreateCommand();
        select.CommandText = $"SELECT tag, group_key, next_read_ms, last_seen_ms, newest_battle_ms, wait_ms FROM {table}";
        var players = new List<TrackedPlayer<TGroup>>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            players.Add(new TrackedPlayer<TGroup>(
                reader.GetString(0), groupOf(reader.GetInt64(1)), reader.GetInt64(2), reader.GetInt64(3),
                reader.GetInt64(4), reader.GetInt64(5)));
        }
        return players;
    }
}
