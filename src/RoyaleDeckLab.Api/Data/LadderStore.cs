using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// Trophy Road and Ranked battles in their own SQLite file: they come in far faster than war battles, and keeping
/// them apart leaves meta.db's writes and size as they are. Sides are keyed by range and time, so the stats read one
/// range's recent battles in key order.
/// </summary>
public sealed class LadderStore
{
    private const string Band = "CASE mode WHEN $trophyRoad THEN standing / $width * $width ELSE standing END";
    private const string LastPollKey = "last_poll_ms";

    private readonly string _connectionString;
    private readonly int _bandWidth;
    private readonly Lock _writeLock = new();
    private readonly Lock _createLock = new();
    private volatile bool _created;

    public LadderStore(string path, int trophyBandWidth = 1000)
    {
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        _bandWidth = trophyBandWidth;
    }

    private void Create(SqliteConnection connection)
    {
        Execute(connection, "PRAGMA journal_mode=WAL;");
        // The first layout's sides are derived data, so they're dropped rather than converted.
        if (HasColumn(connection, "ladder_battles", "cards"))
        {
            Execute(connection, "DROP TABLE ladder_battles; DROP TABLE IF EXISTS ladder_counts;");
        }
        Execute(connection,
            $"""
            CREATE TABLE IF NOT EXISTS ladder_battles (
                mode INTEGER NOT NULL,
                standing INTEGER NOT NULL,
                battle_time_ms INTEGER NOT NULL,
                player_tag TEXT NOT NULL,
                opponent_tag TEXT NOT NULL,
                result INTEGER NOT NULL,
                crowns INTEGER NOT NULL,
                opponent_crowns INTEGER NOT NULL,
                deck TEXT NOT NULL,
                levels BLOB NOT NULL,
                tower_troop_id INTEGER,
                tower_troop_level INTEGER,
                PRIMARY KEY (mode, standing, battle_time_ms, player_tag)
            ) WITHOUT ROWID;
            CREATE UNIQUE INDEX IF NOT EXISTS ladder_battles_by_player ON ladder_battles (player_tag, battle_time_ms);
            CREATE INDEX IF NOT EXISTS ladder_battles_by_time ON ladder_battles (battle_time_ms);
            CREATE TABLE IF NOT EXISTS ladder_state (
                key TEXT NOT NULL PRIMARY KEY,
                value INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ladder_counts (
                mode INTEGER NOT NULL,
                band INTEGER NOT NULL,
                sides INTEGER NOT NULL,
                PRIMARY KEY (mode, band)
            ) WITHOUT ROWID;
            """);
        Recount(connection);
    }

    private void Recount(SqliteConnection connection)
    {
        using var transaction = connection.BeginTransaction();
        using var recount = connection.CreateCommand();
        recount.Transaction = transaction;
        recount.CommandText =
            $"""
            DELETE FROM ladder_counts;
            INSERT INTO ladder_counts (mode, band, sides)
            SELECT mode, {Band}, COUNT(*) FROM ladder_battles GROUP BY 1, 2;
            """;
        AddBandParameters(recount);
        recount.ExecuteNonQuery();
        transaction.Commit();
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
            return MergeBatch(connection, battles.ToList());
        }
    }

    private int MergeBatch(SqliteConnection connection, IReadOnlyList<LadderBattle> battles)
    {
        using var transaction = connection.BeginTransaction();
        using var insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText =
            """
            INSERT OR IGNORE INTO ladder_battles
                (mode, standing, battle_time_ms, player_tag, opponent_tag, result, crowns, opponent_crowns, deck, levels,
                 tower_troop_id, tower_troop_level)
            VALUES ($mode, $standing, $time, $player, $opponent, $result, $crowns, $opponentCrowns, $deck, $levels,
                 $towerTroop, $towerTroopLevel)
            """;
        var mode = insert.Parameters.Add("$mode", SqliteType.Integer);
        var standing = insert.Parameters.Add("$standing", SqliteType.Integer);
        var time = insert.Parameters.Add("$time", SqliteType.Integer);
        var player = insert.Parameters.Add("$player", SqliteType.Text);
        var opponent = insert.Parameters.Add("$opponent", SqliteType.Text);
        var result = insert.Parameters.Add("$result", SqliteType.Integer);
        var crowns = insert.Parameters.Add("$crowns", SqliteType.Integer);
        var opponentCrowns = insert.Parameters.Add("$opponentCrowns", SqliteType.Integer);
        var deck = insert.Parameters.Add("$deck", SqliteType.Text);
        var levels = insert.Parameters.Add("$levels", SqliteType.Blob);
        var towerTroop = insert.Parameters.Add("$towerTroop", SqliteType.Integer);
        var towerTroopLevel = insert.Parameters.Add("$towerTroopLevel", SqliteType.Integer);

        var added = new Dictionary<(LadderMode, int), int>();
        foreach (var battle in battles)
        {
            mode.Value = (int)battle.Mode;
            standing.Value = battle.Standing;
            time.Value = battle.BattleTimeMs;
            player.Value = battle.PlayerTag;
            opponent.Value = battle.OpponentTag;
            result.Value = (int)battle.Result;
            crowns.Value = battle.Crowns;
            opponentCrowns.Value = battle.OpponentCrowns;
            deck.Value = LadderDeck.Key(battle.Cards);
            levels.Value = LadderDeck.Levels(battle.Cards);
            towerTroop.Value = (object?)battle.TowerTroop?.Id ?? DBNull.Value;
            towerTroopLevel.Value = (object?)battle.TowerTroop?.Level ?? DBNull.Value;
            if (insert.ExecuteNonQuery() > 0)
            {
                var key = (battle.Mode, BandOf(battle.Mode, battle.Standing));
                added[key] = added.GetValueOrDefault(key) + 1;
            }
        }

        using var count = connection.CreateCommand();
        count.Transaction = transaction;
        count.CommandText =
            """
            INSERT INTO ladder_counts (mode, band, sides) VALUES ($mode, $band, $sides)
            ON CONFLICT (mode, band) DO UPDATE SET sides = sides + excluded.sides
            """;
        var countMode = count.Parameters.Add("$mode", SqliteType.Integer);
        var band = count.Parameters.Add("$band", SqliteType.Integer);
        var sides = count.Parameters.Add("$sides", SqliteType.Integer);
        foreach (var ((modeOf, bandOf), n) in added)
        {
            countMode.Value = (int)modeOf;
            band.Value = bandOf;
            sides.Value = n;
            count.ExecuteNonQuery();
        }
        transaction.Commit();
        return added.Values.Sum();
    }

    public int Prune(long cutoffMs)
    {
        lock (_writeLock)
        {
            using var connection = Open();
            using var transaction = connection.BeginTransaction();
            using var uncount = connection.CreateCommand();
            uncount.Transaction = transaction;
            uncount.CommandText =
                $"""
                UPDATE ladder_counts SET sides = ladder_counts.sides - pruned.sides
                FROM (
                    SELECT mode, {Band} AS band, COUNT(*) AS sides
                    FROM ladder_battles
                    WHERE battle_time_ms < $cutoff
                    GROUP BY 1, 2
                ) AS pruned
                WHERE ladder_counts.mode = pruned.mode AND ladder_counts.band = pruned.band;
                DELETE FROM ladder_counts WHERE sides <= 0;
                """;
            AddBandParameters(uncount);
            uncount.Parameters.AddWithValue("$cutoff", cutoffMs);
            uncount.ExecuteNonQuery();

            using var delete = connection.CreateCommand();
            delete.Transaction = transaction;
            delete.CommandText = "DELETE FROM ladder_battles WHERE battle_time_ms < $cutoff";
            delete.Parameters.AddWithValue("$cutoff", cutoffMs);
            var pruned = delete.ExecuteNonQuery();
            transaction.Commit();
            return pruned;
        }
    }

    public LadderCounts Counts()
    {
        using var connection = Open();
        using var select = connection.CreateCommand();
        select.CommandText = "SELECT mode, band, sides FROM ladder_counts";

        var trophyRoad = new SortedDictionary<int, int>();
        var ranked = new SortedDictionary<int, int>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            var counts = (LadderMode)reader.GetInt32(0) == LadderMode.TrophyRoad ? trophyRoad : ranked;
            counts[reader.GetInt32(1)] = reader.GetInt32(2);
        }
        return new LadderCounts(trophyRoad, ranked);
    }

    /// <summary>
    /// Each player's latest side since <paramref name="sinceMs"/>, at most <paramref name="perBand"/> per Trophy Road
    /// range and Ranked league, the most recent first.
    /// </summary>
    public IReadOnlyList<LatestLadderSide> LatestPerPlayer(int perBand, long sinceMs)
    {
        using var connection = Open();
        using var select = connection.CreateCommand();
        select.CommandText =
            $"""
            WITH latest AS (
                SELECT player_tag, MAX(battle_time_ms) AS battle_time_ms, mode, standing
                FROM ladder_battles
                WHERE battle_time_ms >= $since
                GROUP BY player_tag
            ), ranked AS (
                SELECT *, ROW_NUMBER() OVER (PARTITION BY mode, {Band} ORDER BY battle_time_ms DESC) AS n
                FROM latest
            )
            SELECT player_tag, battle_time_ms, mode, standing
            FROM ranked
            WHERE n <= $perBand
            """;
        AddBandParameters(select);
        select.Parameters.AddWithValue("$since", sinceMs);
        select.Parameters.AddWithValue("$perBand", perBand);

        var sides = new List<LatestLadderSide>();
        using var reader = select.ExecuteReader();
        while (reader.Read())
        {
            sides.Add(new LatestLadderSide(reader.GetString(0), reader.GetInt64(1), (LadderMode)reader.GetInt32(2), reader.GetInt32(3)));
        }
        return sides;
    }

    public long GetLastPollMs()
    {
        using var connection = Open();
        return GetState(connection, LastPollKey) ?? 0;
    }

    public void SetLastPollMs(long ms)
    {
        lock (_writeLock)
        {
            using var connection = Open();
            SetState(connection, null, LastPollKey, ms);
        }
    }

    private static long? GetState(SqliteConnection connection, string key)
    {
        using var select = connection.CreateCommand();
        select.CommandText = "SELECT value FROM ladder_state WHERE key = $key";
        select.Parameters.AddWithValue("$key", key);
        return select.ExecuteScalar() is long value ? value : null;
    }

    private static void SetState(SqliteConnection connection, SqliteTransaction? transaction, string key, long value)
    {
        using var upsert = connection.CreateCommand();
        upsert.Transaction = transaction;
        upsert.CommandText =
            "INSERT INTO ladder_state (key, value) VALUES ($key, $value) ON CONFLICT (key) DO UPDATE SET value = $value";
        upsert.Parameters.AddWithValue("$key", key);
        upsert.Parameters.AddWithValue("$value", value);
        upsert.ExecuteNonQuery();
    }

    private void AddBandParameters(SqliteCommand command)
    {
        command.Parameters.AddWithValue("$trophyRoad", (int)LadderMode.TrophyRoad);
        command.Parameters.AddWithValue("$width", _bandWidth);
    }

    private int BandOf(LadderMode mode, int standing) => mode == LadderMode.TrophyRoad ? standing / _bandWidth * _bandWidth : standing;

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        try
        {
            connection.Open();
            if (!_created)
            {
                lock (_createLock)
                {
                    if (!_created)
                    {
                        Create(connection);
                        _created = true;
                    }
                }
            }
            return connection;
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    private static bool HasColumn(SqliteConnection connection, string table, string column)
    {
        using var select = connection.CreateCommand();
        select.CommandText = "SELECT COUNT(*) FROM pragma_table_info($table) WHERE name = $column";
        select.Parameters.AddWithValue("$table", table);
        select.Parameters.AddWithValue("$column", column);
        return (long)select.ExecuteScalar()! > 0;
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

public sealed record LatestLadderSide(string PlayerTag, long BattleTimeMs, LadderMode Mode, int Standing);
