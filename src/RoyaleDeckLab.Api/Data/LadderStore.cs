using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// Trophy Road and Ranked battles in their own SQLite file: they come in far faster than war battles, and keeping
/// them apart leaves meta.db's writes and size as they are.
/// </summary>
public sealed class LadderStore
{
    private readonly string _connectionString;
    private readonly Lock _writeLock = new();

    public LadderStore(string path)
    {
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var connection = Open();
        Execute(connection,
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS ladder_battles (
                player_tag TEXT NOT NULL,
                battle_time_ms INTEGER NOT NULL,
                mode TEXT NOT NULL,
                standing INTEGER NOT NULL,
                opponent_tag TEXT NOT NULL,
                result TEXT NOT NULL,
                cards TEXT NOT NULL,
                PRIMARY KEY (player_tag, battle_time_ms)
            ) WITHOUT ROWID;
            CREATE INDEX IF NOT EXISTS ladder_battles_by_time ON ladder_battles (battle_time_ms);
            """);
    }

    /// <returns>How many weren't stored yet: a battle read from both players' logs is stored once.</returns>
    public int Merge(IReadOnlyCollection<LadderBattle> battles)
    {
        if (battles.Count == 0)
        {
            return 0;
        }

        lock (_writeLock)
        {
            using var connection = Open();
            using var transaction = connection.BeginTransaction();
            using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText =
                """
                INSERT OR IGNORE INTO ladder_battles
                    (player_tag, battle_time_ms, mode, standing, opponent_tag, result, cards)
                VALUES ($player, $time, $mode, $standing, $opponent, $result, $cards)
                """;
            var player = insert.Parameters.Add("$player", SqliteType.Text);
            var time = insert.Parameters.Add("$time", SqliteType.Integer);
            var mode = insert.Parameters.Add("$mode", SqliteType.Text);
            var standing = insert.Parameters.Add("$standing", SqliteType.Integer);
            var opponent = insert.Parameters.Add("$opponent", SqliteType.Text);
            var result = insert.Parameters.Add("$result", SqliteType.Text);
            var cards = insert.Parameters.Add("$cards", SqliteType.Text);

            var added = 0;
            foreach (var battle in battles)
            {
                player.Value = battle.PlayerTag;
                time.Value = battle.BattleTimeMs;
                mode.Value = ModeName(battle.Mode);
                standing.Value = battle.Standing;
                opponent.Value = battle.OpponentTag;
                result.Value = battle.Result.ToString().ToLowerInvariant();
                cards.Value = CrownSeriesCardStorage.Serialize(battle.Cards);
                added += insert.ExecuteNonQuery();
            }
            transaction.Commit();
            return added;
        }
    }

    public int Prune(long cutoffMs)
    {
        lock (_writeLock)
        {
            using var connection = Open();
            using var delete = connection.CreateCommand();
            delete.CommandText = "DELETE FROM ladder_battles WHERE battle_time_ms < $cutoff";
            delete.Parameters.AddWithValue("$cutoff", cutoffMs);
            return delete.ExecuteNonQuery();
        }
    }

    /// <summary>
    /// Stored player sides per Trophy Road band of <paramref name="trophyBandWidth"/> trophies, keyed by the band's
    /// lowest trophies, and per Ranked league.
    /// </summary>
    public LadderCounts Counts(int trophyBandWidth)
    {
        using var connection = Open();
        using var select = connection.CreateCommand();
        select.CommandText =
            """
            SELECT mode, CASE mode WHEN $trophyRoad THEN standing / $width * $width ELSE standing END AS band, COUNT(*)
            FROM ladder_battles
            GROUP BY mode, band
            ORDER BY mode, band
            """;
        select.Parameters.AddWithValue("$trophyRoad", ModeName(LadderMode.TrophyRoad));
        select.Parameters.AddWithValue("$width", trophyBandWidth);

        var trophyRoad = new SortedDictionary<int, int>();
        var ranked = new SortedDictionary<int, int>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            var counts = reader.GetString(0) == ModeName(LadderMode.TrophyRoad) ? trophyRoad : ranked;
            counts[reader.GetInt32(1)] = reader.GetInt32(2);
        }
        return new LadderCounts(trophyRoad, ranked);
    }

    private static string ModeName(LadderMode mode) => mode switch
    {
        LadderMode.TrophyRoad => "trophy_road",
        LadderMode.Ranked => "ranked",
        _ => throw new ArgumentOutOfRangeException(nameof(mode), mode, null),
    };

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        return connection;
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }
}

public sealed record LadderCounts(
    IReadOnlyDictionary<int, int> PerTrophyBand,
    IReadOnlyDictionary<int, int> PerRankedLeague);
