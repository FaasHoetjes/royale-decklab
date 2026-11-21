using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelValuesApplierTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"duelvalues-{Guid.NewGuid():N}.db");
    private readonly ServiceProvider _services;
    private readonly DuelValuesStore _store;

    public DuelValuesApplierTests()
    {
        var services = new ServiceCollection();
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<DuelLevelFitRepository>();
        _services = services.BuildServiceProvider();
        using var scope = _services.CreateScope();
        scope.ServiceProvider.GetRequiredService<MetaDbContext>().EnsureMetaSchema();
        _store = new DuelValuesStore(_services.GetRequiredService<IServiceScopeFactory>());
    }

    public void Dispose()
    {
        _services.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    [Fact]
    public async Task Starts_on_the_defaults()
    {
        Assert.Equal(AppliedDuelValues.Default, _store.Current);
        Assert.False(await ApplyAsync(nowMs: 10));
    }

    [Fact]
    public async Task Takes_the_first_refit_outright_and_remembers_it()
    {
        await SaveRefitAsync(1_000, perLevel: 1.60, priorRounds: 43);

        Assert.True(await ApplyAsync(nowMs: 1_100));
        Assert.False(await ApplyAsync(nowMs: 1_200));

        var reloaded = new DuelValuesStore(_services.GetRequiredService<IServiceScopeFactory>()).Current;
        Assert.Equal(1_100, reloaded.AppliedAtMs);
        Assert.Equal(1.60, reloaded.Values.Levels.PerLevel, 10);
        Assert.Equal(43, reloaded.Values.PriorRounds, 10);
        Assert.Equal((1_000L, 1_000L), (reloaded.LevelsFittedAtMs, reloaded.CushionFittedAtMs));
    }

    [Fact]
    public async Task Steps_toward_a_later_refit()
    {
        await SaveRefitAsync(1_000, perLevel: 1.60, priorRounds: 43);
        await ApplyAsync(nowMs: 1_100);
        await SaveRefitAsync(2_000, perLevel: 2.00, priorRounds: 20);

        Assert.True(await ApplyAsync(nowMs: 2_100));

        Assert.Equal(1.75, _store.Current.Values.Levels.PerLevel, 10);
        Assert.Equal(35, _store.Current.Values.PriorRounds, 10);
    }

    [Fact]
    public async Task Keeps_the_values_when_a_refit_is_outside_the_limits()
    {
        await SaveRefitAsync(1_000, perLevel: 4.0, priorRounds: 500);

        Assert.False(await ApplyAsync(nowMs: 1_100));
        Assert.Equal(AppliedDuelValues.Default, _store.Current);
    }

    [Fact]
    public async Task Applies_only_what_is_switched_on()
    {
        await SaveRefitAsync(1_000, perLevel: 1.60, priorRounds: 43);

        Assert.True(await ApplyAsync(nowMs: 1_100, new CrownSeriesOptions { ApplyCushionRefits = false }));

        Assert.Equal(1.60, _store.Current.Values.Levels.PerLevel, 10);
        Assert.Equal(DuelValues.Default.PriorRounds, _store.Current.Values.PriorRounds, 10);
        Assert.Equal(0, _store.Current.CushionFittedAtMs);
    }

    private async Task<bool> ApplyAsync(long nowMs, CrownSeriesOptions? options = null)
    {
        using var scope = _services.CreateScope();
        var applier = new DuelValuesApplier(
            scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>(),
            _store,
            Microsoft.Extensions.Options.Options.Create(options ?? new CrownSeriesOptions()),
            NullLogger<DuelValuesApplier>.Instance);
        return await applier.ApplyAsync(nowMs);
    }

    private async Task SaveRefitAsync(long fittedAtMs, double perLevel, double priorRounds)
    {
        using var scope = _services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>().SaveAsync(new StoredDuelLevelFits(
            fittedAtMs,
            fittedAtMs - 100,
            [new(DuelLevelFitter.AllCaps, 30_000, new(perLevel, 0.05), new(0.07, 0.02), new(0.32, 0.01), new(0.12, 0.01))],
            [new(DuelLevelFitter.AllCaps, 2_900, 125_000, 0.075, priorRounds)]));
    }
}
