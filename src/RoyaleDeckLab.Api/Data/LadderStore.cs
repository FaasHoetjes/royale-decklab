using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// Trophy Road and Ranked battles in their own SQLite file: they come in far faster than war battles, and keeping
/// them apart leaves meta.db's writes and size as they are.
/// </summary>
public sealed class LadderStore
{
    private const string TrophyRoad = "trophy_road";
    private const string Band = "CASE mode WHEN $trophyRoad THEN standing / $width * $width ELSE standing END";

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
            CREATE TABLE IF NOT EXISTS ladder_state (
                key TEXT NOT NULL PRIMARY KEY,
                value INTEGER NOT NULL
            );
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
            $"""
            SELECT mode, {Band} AS band, COUNT(*)
            FROM ladder_battles
            GROUP BY mode, band
            ORDER BY mode, band
            """;
        AddBandParameters(select, trophyBandWidth);

        var trophyRoad = new SortedDictionary<int, int>();
        var ranked = new SortedDictionary<int, int>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            var counts = reader.GetString(0) == TrophyRoad ? trophyRoad : ranked;
            counts[reader.GetInt32(1)] = reader.GetInt32(2);
        }
        return new LadderCounts(trophyRoad, ranked);
    }

    /// <summary>
    /// Each player's latest side since <paramref name="sinceMs"/>, at most <paramref name="perBand"/> per Trophy Road
    /// range and Ranked league, the most recent first.
    /// </summary>
    public IReadOnlyList<LadderBattle> LatestPerPlayer(int perBand, int trophyBandWidth, long sinceMs)
    {
        using var connection = Open();
        using var select = connection.CreateCommand();
        select.CommandText =
            $"""
            WITH latest AS (
                SELECT player_tag, MAX(battle_time_ms) AS battle_time_ms, mode, standing, opponent_tag, result, cards
                FROM ladder_battles
                WHERE battle_time_ms >= $since
                GROUP BY player_tag
            ), ranked AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY mode, {Band} ORDER BY battle_time_ms DESC) AS n
                FROM latest
            )
            SELECT player_tag, battle_time_ms, mode, standing, opponent_tag, result, cards
            FROM ranked
            WHERE n <= $perBand
            """;
        AddBandParameters(select, trophyBandWidth);
        select.Parameters.AddWithValue("$since", sinceMs);
        select.Parameters.AddWithValue("$perBand", perBand);

        var sides = new List<LadderBattle>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            sides.Add(new LadderBattle
            {
                PlayerTag = reader.GetString(0),
                BattleTimeMs = reader.GetInt64(1),
                Mode = reader.GetString(2) == TrophyRoad ? LadderMode.TrophyRoad : LadderMode.Ranked,
                Standing = reader.GetInt32(3),
                OpponentTag = reader.GetString(4),
                Result = Enum.Parse<BattleResult>(reader.GetString(5), ignoreCase: true),
                Cards = CrownSeriesCardStorage.Deserialize(reader.GetString(6)),
            });
        }
        return sides;
    }

    public long GetLastPollMs()
    {
        using var connection = Open();
        using var select = connection.CreateCommand();
        select.CommandText = "SELECT value FROM ladder_state WHERE key = 'last_poll_ms'";
        return select.ExecuteScalar() is long ms ? ms : 0;
    }

    public void SetLastPollMs(long ms)
    {
        lock (_writeLock)
        {
            using var connection = Open();
            using var upsert = connection.CreateCommand();
            upsert.CommandText =
                "INSERT INTO ladder_state (key, value) VALUES ('last_poll_ms', $ms) ON CONFLICT (key) DO UPDATE SET value = $ms";
            upsert.Parameters.AddWithValue("$ms", ms);
            upsert.ExecuteNonQuery();
        }
    }

    private static void AddBandParameters(SqliteCommand command, int trophyBandWidth)
    {
        command.Parameters.AddWithValue("$trophyRoad", TrophyRoad);
        command.Parameters.AddWithValue("$width", trophyBandWidth);
    }

    private static string ModeName(LadderMode mode) => mode switch
    {
        LadderMode.TrophyRoad => TrophyRoad,
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
