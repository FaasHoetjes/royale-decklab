using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DuelLevelRefitTests : IDisposable
{
    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"duelrefit-{Guid.NewGuid():N}.db");
    private readonly ServiceProvider _services;

    public DuelLevelRefitTests()
    {
        var services = new ServiceCollection();
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<CrownSeriesRepository>();
        services.AddScoped<DuelLevelFitRepository>();
        _services = services.BuildServiceProvider();
        using var scope = _services.CreateScope();
        scope.ServiceProvider.GetRequiredService<MetaDbContext>().EnsureMetaSchema();
    }

    public void Dispose()
    {
        _services.Dispose();
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    [Theory]
    [InlineData("2026-11-24T06:00:00Z", "2026-11-24T06:00:00Z")]
    [InlineData("2026-11-24T05:59:00Z", "2026-11-17T06:00:00Z")]
    [InlineData("2026-11-23T20:00:00Z", "2026-11-17T06:00:00Z")]
    [InlineData("2026-11-29T12:00:00Z", "2026-11-24T06:00:00Z")]
    public void Is_due_on_tuesday_morning(string now, string due)
        => Assert.Equal(DateTimeOffset.Parse(due), DuelLevelRefitService.LastDue(DateTimeOffset.Parse(now)));

    [Fact]
    public async Task Reads_each_duel_once_with_the_lower_tag_first_and_the_cap_from_its_highest_card()
    {
        await MergeAsync(
            Round("#B", "#A", 0, BattleResult.Win, level: 13),
            Round("#A", "#B", 0, BattleResult.Loss, level: 12),
            Round("#B", "#A", 1, BattleResult.Loss, level: 12),
            Round("#A", "#B", 1, BattleResult.Win, level: 12));

        var duel = Assert.Single(Repository().ReadDuels());

        Assert.Equal(13, duel.Cap);
        Assert.Equal([false, true], duel.Rounds.Select(r => r.FirstWon));
        Assert.All(duel.Rounds, r => Assert.Equal("#A", r.First.PlayerTag));
    }

    [Fact]
    public async Task Skips_a_duel_missing_one_players_deck()
    {
        await MergeAsync(Round("#A", "#B", 0, BattleResult.Win, level: 12));

        Assert.Empty(Repository().ReadDuels());
    }

    [Fact]
    public async Task Keeps_every_refit_and_reads_back_the_latest()
    {
        using var scope = _services.CreateScope();
        var fits = scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>();
        await fits.SaveAsync(new StoredDuelLevelFits(1_000, 900, [Fit(DuelLevelFitter.AllCaps, evo: 0.30)]));
        await fits.SaveAsync(new StoredDuelLevelFits(2_000, 1_900, [Fit(DuelLevelFitter.AllCaps, evo: 0.32), Fit(14, evo: 0.2)]));

        var latest = fits.Latest();

        Assert.NotNull(latest);
        Assert.Equal(1_900, latest.LatestRoundMs);
        Assert.Equal([0.32, 0.2], latest.Fits.Select(f => f.Evo.Value));
        Assert.Equal([2_000L, 1_000L], fits.History(5).Select(h => h.FittedAtMs));
        Assert.Equal([2_000L], fits.History(1).Select(h => h.FittedAtMs));
    }

    private static DuelLevelFit Fit(int cap, double evo)
        => new(cap, 5_000, new(1.8, 0.05), new(0.07, 0.02), new(evo, 0.01), new(0.12, 0.01));

    private CrownSeriesRepository Repository()
        => _services.CreateScope().ServiceProvider.GetRequiredService<CrownSeriesRepository>();

    private async Task MergeAsync(params CrownSeriesRound[] rounds)
    {
        using var scope = _services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<CrownSeriesRepository>().MergeRoundsAsync(rounds);
    }

    private static CrownSeriesRound Round(string player, string opponent, int round, BattleResult result, int level) => new()
    {
        PlayerTag = player,
        OpponentTag = opponent,
        BattleTimeMs = 1_000,
        Round = round,
        Result = result,
        Cards = Enumerable.Range(1, 8).Select(id => new CrownSeriesCard(id, level, CardVersionKind.Normal)).ToList(),
        League = 1,
        EventTag = "",
        GameModeId = 0,
    };
}
