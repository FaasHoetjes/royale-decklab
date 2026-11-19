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

        var counts = store.Counts(1000);

        Assert.Equal(new Dictionary<int, int> { [9000] = 1, [10000] = 2 }, counts.PerTrophyBand);
        Assert.Equal(new Dictionary<int, int> { [3] = 2 }, counts.PerRankedLeague);
    }

    [Fact]
    public void Reopening_keeps_what_was_stored()
    {
        new LadderStore(_path).Merge([Side("#A", 1000)]);

        Assert.Equal(0, new LadderStore(_path).Merge([Side("#A", 1000)]));
    }
}
