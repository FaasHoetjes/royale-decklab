using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Samples players from the top war clans and keeps <see cref="SeasonBoostStore"/> on the boosted cards they play.</summary>
public sealed class SeasonBoostWatchService(
    IServiceScopeFactory scopeFactory,
    SeasonBoostStore store,
    TimeProvider clock,
    IOptions<MetaOptions> options,
    ILogger<SeasonBoostWatchService> logger) : BackgroundService
{
    private const int ClansToSample = 10;
    private const int BatchSize = 10;

    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(_opt.SeasonBoostCheckIntervalMs);
        logger.LogInformation("Season boost watch scheduled every {Minutes} min", interval.TotalMinutes);
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
                    logger.LogError(ex, "Season boost check failed; retrying on the next tick");
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
        var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleClient>();

        var players = await SamplePlayerTagsAsync(client, ct);
        var samples = new List<SeasonBoostDetection.Sample>();
        foreach (var batch in players.Chunk(BatchSize))
        {
            var read = await Task.WhenAll(batch.Select(tag => ReadSampleAsync(client, tag, ct)));
            samples.AddRange(read.OfType<SeasonBoostDetection.Sample>());
        }

        // An outage that let few players through would otherwise read as most boosts having ended.
        var minSamples = _opt.SeasonBoostSamplePlayers / 2;
        if (samples.Count < minSamples)
        {
            logger.LogWarning("Only {Read} of {Wanted} players could be read; keeping the season boosts as they are",
                samples.Count, players.Count);
            return;
        }

        await store.SaveAsync(SeasonBoostDetection.BoostedCards(samples, clock.GetUtcNow()), ct);
    }

    private async Task<List<string>> SamplePlayerTagsAsync(ClashRoyaleClient client, CancellationToken ct)
    {
        var tags = new List<string>();
        foreach (var clan in await client.GetTopWarClansAsync(ClansToSample, ct))
        {
            tags.AddRange(await client.GetClanMemberTagsAsync(clan, ct));
            if (tags.Count >= _opt.SeasonBoostSamplePlayers)
            {
                break;
            }
        }
        return tags.Distinct().Take(_opt.SeasonBoostSamplePlayers).ToList();
    }

    private async Task<SeasonBoostDetection.Sample?> ReadSampleAsync(ClashRoyaleClient client, string tag, CancellationToken ct)
    {
        try
        {
            var profile = client.GetPlayerDataAsync(tag, ct);
            var battles = client.GetPlayerBattlelogAsync(tag, ct);
            await Task.WhenAll(profile, battles);
            return new SeasonBoostDetection.Sample(await profile, await battles);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Couldn't read a sampled player for the season boost check; skipping them");
            return null;
        }
    }
}
