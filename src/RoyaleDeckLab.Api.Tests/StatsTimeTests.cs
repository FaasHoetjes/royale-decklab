using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Tests;

public sealed class StatsTimeTests : IDisposable
{
    private static readonly DateTimeOffset Noon = new(2026, 11, 5, 12, 0, 0, TimeSpan.Zero);
    private static readonly DateOnly Today = DateOnly.FromDateTime(Noon.UtcDateTime);

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"stats-time-{Guid.NewGuid():N}.db");
    private readonly StatsStore _store;

    public StatsTimeTests() => _store = new StatsStore(_path);

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            File.Delete(file);
        }
    }

    private static byte[] Id(int n) => [.. Enumerable.Repeat((byte)n, 16)];

    private void Visit(int visitor, DateOnly day, string source = "direct", long seconds = 0)
    {
        var at = new DateTimeOffset(day.ToDateTime(TimeOnly.FromTimeSpan(TimeSpan.FromHours(12))), TimeSpan.Zero);
        _store.Add([new StatsEvent(at.ToUnixTimeMilliseconds(), StatsStore.Kinds.Tool, Id(visitor), [], "home", null, "phone", source)]);
        if (seconds > 0)
        {
            _store.AddTime([new VisitTime(day, Id(visitor), seconds * 1000)]);
        }
    }

    private long? Metric(DateOnly from, DateOnly to, string metric, string dim = "", StatsFilter? filter = null)
        => _store.Compute(from, to, filter).FirstOrDefault(t => t.Metric == metric && t.Dim == dim)?.Value;

    [Fact]
    public void TakesTheMedianAndMean_OfVisitorsWhoseTimeWasMeasured()
    {
        Visit(1, Today, seconds: 10);
        Visit(2, Today, seconds: 30);
        Visit(3, Today, seconds: 200);
        Visit(4, Today);

        Assert.Equal(30, Metric(Today, Today, "time_median"));
        Assert.Equal(80, Metric(Today, Today, "time_mean"));
        Assert.Equal(3, Metric(Today, Today, "time_visitors"));
    }

    [Fact]
    public void AddsUpAVisitorsDays_BeforeTakingTheMedian()
    {
        Visit(1, Today.AddDays(-1), seconds: 20);
        Visit(1, Today, seconds: 20);
        Visit(2, Today, seconds: 30);

        Assert.Equal(35, Metric(Today.AddDays(-1), Today, "time_median"));
        Assert.Equal(25, Metric(Today, Today, "time_median"));
    }

    [Fact]
    public void SplitsTheMedianBySource()
    {
        Visit(1, Today, "reddit", seconds: 60);
        Visit(2, Today, "reddit", seconds: 120);
        Visit(3, Today, "google", seconds: 10);

        Assert.Equal(90, Metric(Today, Today, "source_time", "reddit"));
        Assert.Equal(2, Metric(Today, Today, "source_time_visitors", "reddit"));
        Assert.Equal(10, Metric(Today, Today, "source_time", "google"));
    }

    [Fact]
    public void AFilter_KeepsOnlyTheTimeOfTheVisitorsItMatches()
    {
        Visit(1, Today, "reddit", seconds: 60);
        Visit(2, Today, "google", seconds: 10);

        Assert.Equal(60, Metric(Today, Today, "time_median", filter: new StatsFilter(Source: "reddit")));
    }

    [Fact]
    public void WithoutMeasuredTime_ThereIsNoMedian()
    {
        Visit(1, Today);

        Assert.Null(Metric(Today, Today, "time_median"));
    }

    [Fact]
    public void CapsAVisitorsDay()
    {
        Visit(1, Today, seconds: 3 * 3600);
        _store.AddTime([new VisitTime(Today, Id(1), 3 * 3_600_000)]);

        Assert.Equal((long)StatsStore.MaxTimePerDay.TotalSeconds, Metric(Today, Today, "time_median"));
    }

    [Fact]
    public void Maintain_KeepsTheMedianInTheTotals_AndDeletesTheTime()
    {
        var old = Today.AddDays(-StatsStore.RetentionDays);
        Visit(1, old, seconds: 40);
        _store.AddTime([new VisitTime(old.AddDays(-1), Id(2), 5_000)]);

        _store.Maintain(Today);

        var day = _store.StoredTotals(periodLength: 10)[StatsStore.Day(old)];
        Assert.Contains(new StatsTotal("time_median", "", 40), day);
        Assert.Null(Metric(old.AddDays(-1), old, "time_visitors"));
    }

    [Fact]
    public void Forget_DeletesTheVisitorsEventsAndTime()
    {
        Visit(1, Today, seconds: 40);
        Visit(2, Today, seconds: 10);

        _store.Forget(Id(1));

        Assert.Equal(1, Metric(Today, Today, "visitors"));
        Assert.Equal(10, Metric(Today, Today, "time_median"));
    }
}
