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
        services.AddScoped<DuelLevelRefit>();
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
        await fits.SaveAsync(new StoredDuelLevelFits(1_000, 900, [Fit(DuelLevelFitter.AllCaps, evo: 0.30)], []));
        await fits.SaveAsync(new StoredDuelLevelFits(
            2_000, 1_900, [Fit(DuelLevelFitter.AllCaps, evo: 0.32), Fit(14, evo: 0.2)], [new(DuelLevelFitter.AllCaps, 300, 9_000, 0.07, 50)]));
        await fits.SaveAsync(new StoredDuelLevelFits(3_000, 2_900, [], [new(DuelLevelFitter.AllCaps, 320, 9_500, 0.08, 38)]));

        var latest = fits.Latest();

        Assert.NotNull(latest);
        Assert.Equal(2_900, latest.LatestRoundMs);
        Assert.Empty(latest.Fits);
        Assert.Equal([38.0], latest.Cushions.Select(c => c.PriorRounds));
        var history = fits.History(5);
        Assert.Equal([3_000L, 2_000L, 1_000L], history.Select(h => h.FittedAtMs));
        Assert.Equal([0.32, 0.2], history[1].Fits.Select(f => f.Evo.Value));
        Assert.Equal([50.0], history[1].Cushions.Select(c => c.PriorRounds));
        Assert.Equal([3_000L], fits.History(1).Select(h => h.FittedAtMs));
    }

    [Fact]
    public async Task Refits_once_per_tuesday_and_only_after_new_rounds()
    {
        const long firstTuesday = 1_000_000;
        const long nextTuesday = 2_000_000;
        await MergeAsync(SimulatedRounds(count: 4_000, firstBattleMs: 0));

        Assert.Equal(DuelLevelRefitOutcome.Saved, (await RefitAsync(firstTuesday, nowMs: firstTuesday + 1)).Levels);
        Assert.Equal(DuelLevelRefitOutcome.AlreadyFitted, (await RefitAsync(firstTuesday, nowMs: firstTuesday + 2)).Levels);
        Assert.Equal(DuelLevelRefitOutcome.NoNewRounds, (await RefitAsync(nextTuesday, nowMs: nextTuesday + 1)).Levels);

        await MergeAsync(SimulatedRounds(count: 1, firstBattleMs: firstTuesday + 10));

        var refit = await RefitAsync(nextTuesday, nowMs: nextTuesday + 2);
        Assert.Equal(DuelLevelRefitOutcome.Saved, refit.Levels);
        Assert.Equal(nextTuesday + 2, LatestFits()?.FittedAtMs);
    }

    [Fact]
    public async Task Refits_the_levels_again_the_same_week_when_only_the_cushion_could_be_fitted()
    {
        const long tuesday = 1_000_000;
        await MergeAsync(Simulated.SpreadDecks(cap: 12, spread: 0.07, decks: 250, roundsPerDeck: 12)
            .SelectMany((d, i) => Simulated.Rounds(d, i))
            .ToArray());

        var cushionOnly = await RefitAsync(tuesday, nowMs: tuesday + 1);
        Assert.Equal(DuelLevelRefitOutcome.TooFewDuels, cushionOnly.Levels);
        Assert.Equal(DuelLevelRefitOutcome.Saved, cushionOnly.Cushion);

        await MergeAsync(SimulatedRounds(count: 4_000, firstBattleMs: 10_000));

        var both = await RefitAsync(tuesday, nowMs: tuesday + 2);
        Assert.Equal(DuelLevelRefitOutcome.Saved, both.Levels);
        Assert.Equal(DuelLevelRefitOutcome.AlreadyFitted, both.Cushion);
    }

    [Fact]
    public async Task Saves_nothing_with_too_few_duels()
    {
        await MergeAsync(SimulatedRounds(count: 20, firstBattleMs: 0));

        var refit = await RefitAsync(1_000_000, nowMs: 1_000_001);
        Assert.Equal(DuelLevelRefitOutcome.TooFewDuels, refit.Levels);
        Assert.Equal(DuelLevelRefitOutcome.TooFewDuels, refit.Cushion);
        Assert.Null(LatestFits());
    }

    private static CrownSeriesRound[] SimulatedRounds(int count, long firstBattleMs)
        => Simulated.Duels(cap: 12, count: count)
            .Where(d => d.Rounds[0].First.PlayerTag != d.Rounds[0].Second.PlayerTag)
            .SelectMany((d, i) => Simulated.Rounds(d, firstBattleMs + i))
            .ToArray();

    private async Task<DuelLevelRefitResult> RefitAsync(long dueMs, long nowMs)
    {
        using var scope = _services.CreateScope();
        return await scope.ServiceProvider.GetRequiredService<DuelLevelRefit>().RunAsync(dueMs, nowMs, Simulated.Champions);
    }

    private StoredDuelLevelFits? LatestFits()
    {
        using var scope = _services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<DuelLevelFitRepository>().Latest();
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
