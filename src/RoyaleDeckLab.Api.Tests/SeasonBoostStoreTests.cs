using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class SeasonBoostStoreTests : IDisposable
{
    private static readonly long Hour = (long)TimeSpan.FromHours(1).TotalMilliseconds;
    private static readonly long PatchStart = new DateTimeOffset(2026, 12, 7, 9, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds();

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"seasonboosts-{Guid.NewGuid():N}.db");
    private readonly ServiceProvider _services;

    public SeasonBoostStoreTests()
    {
        var services = new ServiceCollection();
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<BattleRepository>();
        _services = services.BuildServiceProvider();

        using var scope = _services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.MetaState.Add(new MetaStateEntity { Id = 1 });
        db.SaveChanges();
    }

    public void Dispose()
    {
        _services.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    private BattleRepository Repository() => _services.CreateScope().ServiceProvider.GetRequiredService<BattleRepository>();

    [Fact]
    public async Task ANewPatch_ClearsTheBoosts_AndIsCheckedAFewHoursIn_EvenIfACheckRanBeforeTheBoundaryWasSet()
    {
        var store = new SeasonBoostStore(_services.GetRequiredService<IServiceScopeFactory>(), NullLogger<SeasonBoostStore>.Instance);
        await store.SaveAsync(new HashSet<int> { 26000021, 28000006 }, CancellationToken.None);
        var checkBeforeTheBoundaryWasSet = PatchStart + 4 * Hour;
        await Repository().SetLastSeasonBoostCheckMsAsync(checkBeforeTheBoundaryWasSet);

        await store.ClearForPatchAsync(PatchStart, CancellationToken.None);

        var repository = Repository();
        Assert.Empty(store.Current.CardIds);
        Assert.Empty(repository.GetSeasonBoosts());
        Assert.Equal(PatchStart, repository.GetSeasonBoostsPatchStartMs());
        Assert.Equal(PatchStart + 3 * Hour,
            SeasonBoostWatchService.NextCheckMs(repository.GetLastSeasonBoostCheckMs(), PatchStart, 12 * Hour));
    }
}
