using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Samples players from war clans and keeps <see cref="SeasonBoostStore"/> on the boosted cards they play.</summary>
public sealed class SeasonBoostWatchService(
    IServiceScopeFactory scopeFactory,
    SeasonBoostStore store,
    TimeProvider clock,
    IOptions<MetaOptions> options,
    ILogger<SeasonBoostWatchService> logger) : BackgroundService
{
    // The top war clans have nearly every card at King Tower level, where a boost doesn't show.
    private const int FirstClanRank = 100;
    private const int MaxClansToSample = 40;
    private const int BatchSize = 10;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(15);

    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(_opt.SeasonBoostCheckIntervalMs);
        logger.LogInformation("Season boost watch scheduled every {Minutes} min", interval.TotalMinutes);
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var checkedBoosts = false;
                try
                {
                    checkedBoosts = await CheckAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Season boost check failed; retrying in {Minutes} min", RetryDelay.TotalMinutes);
                }
                await Task.Delay(checkedBoosts ? interval : RetryDelay, clock, stoppingToken);
            }
        }
        catch (OperationCanceledException)
        {
        }
    }

    private async Task<bool> CheckAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<ClashRoyaleCrawlClient>();

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
            return false;
        }

        var known = store.Current.CardIds;
        await store.SaveAsync(SeasonBoostDetection.BoostedCards(samples, clock.GetUtcNow(), known), ct);
        return true;
    }

    private async Task<List<string>> SamplePlayerTagsAsync(ClashRoyaleCrawlClient client, CancellationToken ct)
    {
        var tags = new List<string>();
        var clans = await client.GetTopWarClansAsync(FirstClanRank + MaxClansToSample, ct);
        foreach (var clan in clans.Skip(FirstClanRank))
        {
            tags.AddRange(await client.GetClanMemberTagsAsync(clan, ct));
            if (tags.Count >= _opt.SeasonBoostSamplePlayers)
            {
                break;
            }
        }
        return tags.Distinct().Take(_opt.SeasonBoostSamplePlayers).ToList();
    }

    private async Task<SeasonBoostDetection.Sample?> ReadSampleAsync(ClashRoyaleCrawlClient client, string tag, CancellationToken ct)
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
