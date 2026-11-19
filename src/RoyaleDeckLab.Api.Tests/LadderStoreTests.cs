using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class LadderStoreTests : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"ladder-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            File.Delete(_path + suffix);
        }
    }

    private static LadderBattle Side(string tag, long timeMs, LadderMode mode = LadderMode.TrophyRoad, int standing = 10000) => new()
    {
        PlayerTag = tag,
        OpponentTag = "#OPP",
        BattleTimeMs = timeMs,
        Mode = mode,
        Standing = standing,
        Result = BattleResult.Win,
        Cards = [new CrownSeriesCard(26000000, 16, CardVersionKind.Evo)],
    };

    [Fact]
    public void A_side_read_twice_is_stored_once()
    {
        var store = new LadderStore(_path);

        Assert.Equal(2, store.Merge([Side("#A", 1000), Side("#B", 1000)]));
        Assert.Equal(1, store.Merge([Side("#A", 1000), Side("#A", 2000)]));
    }

    [Fact]
    public void Prune_drops_only_the_sides_before_the_cutoff()
    {
        var store = new LadderStore(_path);
        store.Merge([Side("#A", 1000), Side("#A", 2000), Side("#A", 3000)]);

        Assert.Equal(2, store.Prune(3000));
        Assert.Equal(0, store.Prune(3000));
    }

    [Fact]
    public void Counts_group_trophy_road_into_bands_and_ranked_by_league()
    {
        var store = new LadderStore(_path);
        store.Merge([
            Side("#A", 1, standing: 9999),
            Side("#B", 1, standing: 10000),
            Side("#C", 1, standing: 10999),
            Side("#D", 1, LadderMode.Ranked, 3),
            Side("#E", 1, LadderMode.Ranked, 3),
        ]);

        var counts = store.Counts();

        Assert.Equal(new Dictionary<int, int> { [9000] = 1, [10000] = 2 }, counts.PerTrophyBand);
        Assert.Equal(new Dictionary<int, int> { [3] = 2 }, counts.PerRankedLeague);
    }

    [Fact]
    public void Counts_follow_prunes_and_survive_a_reopen()
    {
        var store = new LadderStore(_path);
        store.Merge([Side("#A", 1000), Side("#A", 2000), Side("#B", 3000, LadderMode.Ranked, 4)]);
        store.Merge([Side("#A", 1000)]);
        store.Prune(1500);

        var counts = new LadderStore(_path).Counts();

        Assert.Equal(new Dictionary<int, int> { [10000] = 1 }, counts.PerTrophyBand);
        Assert.Equal(new Dictionary<int, int> { [4] = 1 }, counts.PerRankedLeague);
        Assert.Equal(counts.PerTrophyBand, store.Counts().PerTrophyBand);
    }

    [Fact]
    public void A_side_keeps_its_deck_levels_crowns_and_tower_troop()
    {
        var store = new LadderStore(_path);
        store.Merge([Side("#A", 1000) with
        {
            Cards = [new CrownSeriesCard(26000000, 16, CardVersionKind.Evo), new CrownSeriesCard(26000001, 15, CardVersionKind.Normal)],
            Crowns = 3,
            OpponentCrowns = 1,
            TowerTroop = new CrownSeriesCard(159000000, 14, CardVersionKind.Normal),
        }]);

        using var connection = new SqliteConnection($"Data Source={_path}");
        connection.Open();
        using var select = connection.CreateCommand();
        select.CommandText = "SELECT deck, levels, crowns, opponent_crowns, tower_troop_id, tower_troop_level FROM ladder_battles";
        using var reader = select.ExecuteReader();
        Assert.True(reader.Read());
        Assert.Equal("26000000e,26000001", reader.GetString(0));
        Assert.Equal(new byte[] { 16, 15 }, (byte[])reader.GetValue(1));
        Assert.Equal((3, 1, 159000000, 14), (reader.GetInt32(2), reader.GetInt32(3), reader.GetInt32(4), reader.GetInt32(5)));
    }

    [Fact]
    public void The_first_layout_is_replaced_by_the_current_one()
    {
        using (var connection = new SqliteConnection($"Data Source={_path}"))
        {
            connection.Open();
            using var create = connection.CreateCommand();
            create.CommandText =
                """
                CREATE TABLE ladder_battles (player_tag TEXT, battle_time_ms INTEGER, mode TEXT, standing INTEGER,
                    opponent_tag TEXT, result TEXT, cards TEXT, PRIMARY KEY (player_tag, battle_time_ms)) WITHOUT ROWID;
                INSERT INTO ladder_battles VALUES ('#A', 1000, 'trophy_road', 10000, '#OPP', 'win', '[]');
                """;
            create.ExecuteNonQuery();
        }
        SqliteConnection.ClearAllPools();

        var store = new LadderStore(_path);

        Assert.Equal(1, store.Merge([Side("#A", 1000)]));
        Assert.Equal(new Dictionary<int, int> { [10000] = 1 }, store.Counts().PerTrophyBand);
    }

    [Fact]
    public void Counts_are_regrouped_when_the_band_width_changes()
    {
        new LadderStore(_path).Merge([Side("#A", 1, standing: 9999), Side("#B", 1, standing: 10000), Side("#C", 1, standing: 10999)]);

        var counts = new LadderStore(_path, 500).Counts();

        Assert.Equal(new Dictionary<int, int> { [9500] = 1, [10000] = 1, [10500] = 1 }, counts.PerTrophyBand);
    }

    [Fact]
    public void A_broken_file_fails_each_call_until_its_replaced()
    {
        File.WriteAllText(_path, "not a database, but long enough to be read as one's header");
        var store = new LadderStore(_path);

        Assert.Throws<SqliteException>(() => store.Counts());
        Assert.Throws<SqliteException>(() => store.Counts());

        SqliteConnection.ClearAllPools();
        File.Delete(_path);
        Assert.Equal(1, store.Merge([Side("#A", 1000)]));
    }

    [Fact]
    public void Reopening_keeps_what_was_stored()
    {
        new LadderStore(_path).Merge([Side("#A", 1000)]);

        Assert.Equal(0, new LadderStore(_path).Merge([Side("#A", 1000)]));
    }
}
