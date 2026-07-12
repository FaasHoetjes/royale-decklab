using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class SeasonWatchService(
    IServiceScopeFactory scopeFactory,
    MetaCache cache,
    IOptions<MetaOptions> options,
    ILogger<SeasonWatchService> logger) : BackgroundService
{
    private const int MaxSeasonsPerProbe = 100;

    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(_opt.SeasonCheckIntervalMs);
        logger.LogInformation("Season watch scheduled every {Minutes} min", interval.TotalMinutes);
        try
        {
            using var timer = new PeriodicTimer(interval);
            do
            {
                try
                {
                    await CheckAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Season check failed; retrying on the next tick");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task CheckAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleClient>();

        var known = store.GetKnownSeasonId();
        if (known == 0)
        {
            await BootstrapAsync(store, client, ct);
            return;
        }

        var latest = await ProbeLatestSeasonAsync(client, known, ct);
        if (latest == known)
        {
            return;
        }

        if (cache.IsBuilding)
        {
            logger.LogInformation(
                "New season {Season} detected but a meta build is running; deferring to the next tick", latest);
            return;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        await cache.SetEpochAsync(now, ct);
        await store.SetKnownSeasonIdAsync(latest, ct);
        logger.LogInformation("New season detected ({Old} -> {New}); patch boundary set to {Epoch}",
            known, latest, MetaCache.IsoMs(now));
    }

    private async Task BootstrapAsync(BattleRepository store, ClashRoyaleClient client, CancellationToken ct)
    {
        if (!await client.SeasonHasRankingsAsync(_opt.SeasonIdSeed, ct))
        {
            logger.LogWarning("Season seed {Seed} has no rankings; check Meta:SeasonIdSeed", _opt.SeasonIdSeed);
            return;
        }
        var latest = await ProbeLatestSeasonAsync(client, _opt.SeasonIdSeed, ct);
        await store.SetKnownSeasonIdAsync(latest, ct);
        logger.LogInformation("Season watch initialised at season {Season}", latest);
    }

    private static async Task<int> ProbeLatestSeasonAsync(ClashRoyaleClient client, int from, CancellationToken ct)
    {
        var latest = from;
        while (latest < from + MaxSeasonsPerProbe && await client.SeasonHasRankingsAsync(latest + 1, ct))
        {
            latest++;
        }
        return latest;
    }
}
