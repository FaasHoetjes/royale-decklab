using Microsoft.Extensions.Options;
using Polly.CircuitBreaker;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
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

    // Often enough that a new patch clears last season's boosts within the quarter hour.
    private static readonly TimeSpan Tick = TimeSpan.FromMinutes(15);

    // Gives players time to battle in the new patch, so the first check has enough of them to find the boosts.
    public static readonly TimeSpan FirstCheckAfterPatch = TimeSpan.FromHours(3);

    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var startedMs = clock.GetUtcNow().ToUnixTimeMilliseconds();
        var retryAtMs = 0L;
        logger.LogInformation("Season boost watch scheduled every {Minutes} min, and {FirstHours} h after a new patch",
            TimeSpan.FromMilliseconds(_opt.SeasonBoostCheckIntervalMs).TotalMinutes, FirstCheckAfterPatch.TotalHours);
        try
        {
            while (true)
            {
                try
                {
                    var patchStartMs = await ClearOnNewPatchAsync(stoppingToken);
                    var nowMs = clock.GetUtcNow().ToUnixTimeMilliseconds();
                    var dueMs = Math.Max(NextCheckMs(LastCheckMs(), patchStartMs, _opt.SeasonBoostCheckIntervalMs),
                        Math.Max(startedMs + _opt.SeasonBoostStartupDelayMs, retryAtMs));
                    if (nowMs >= dueMs && !await CheckAsync(patchStartMs, stoppingToken))
                    {
                        retryAtMs = nowMs + (long)RetryDelay.TotalMilliseconds;
                    }
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    logger.LogError(ex, "Season boost check failed; retrying in {Minutes} min", RetryDelay.TotalMinutes);
                    retryAtMs = clock.GetUtcNow().ToUnixTimeMilliseconds() + (long)RetryDelay.TotalMilliseconds;
                }
                await Task.Delay(Tick, clock, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    /// <summary>
    /// When the next check is due: a few hours into a new patch, then once per interval. A deploy waits out the rest
    /// of the interval rather than sampling again at once.
    /// </summary>
    public static long NextCheckMs(long lastCheckMs, long patchStartMs, long intervalMs)
    {
        var firstAfterPatchMs = patchStartMs + (long)FirstCheckAfterPatch.TotalMilliseconds;
        var hasCheckedThisPatch = lastCheckMs >= firstAfterPatchMs;
        return hasCheckedThisPatch ? lastCheckMs + intervalMs : firstAfterPatchMs;
    }

    private long LastCheckMs()
    {
        using var scope = scopeFactory.CreateScope();
        return scope.ServiceProvider.GetRequiredService<BattleRepository>().GetLastSeasonBoostCheckMs();
    }

    /// <summary>The patch the boosts belong to, clearing them first when a new one started since they were found.</summary>
    private async Task<long> ClearOnNewPatchAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<BattleRepository>();
        var patchStartMs = repository.GetEpochStart();
        if (patchStartMs != repository.GetSeasonBoostsPatchStartMs())
        {
            await store.ClearForPatchAsync(patchStartMs, ct);
        }
        return patchStartMs;
    }

    private async Task<bool> CheckAsync(long patchStartMs, CancellationToken ct)
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
        await store.SaveAsync(SeasonBoostDetection.BoostedCards(samples, clock.GetUtcNow(), patchStartMs, known), ct);
        await scope.ServiceProvider.GetRequiredService<BattleRepository>()
            .SetLastSeasonBoostCheckMsAsync(clock.GetUtcNow().ToUnixTimeMilliseconds(), ct);
        return true;
    }

    private async Task<List<string>> SamplePlayerTagsAsync(ClashRoyaleCrawlClient client, CancellationToken ct)
    {
        var tags = new List<string>();
        var clans = await client.GetTopWarClansAsync(FirstClanRank + MaxClansToSample, ct);
        foreach (var clan in clans.Skip(FirstClanRank))
        {
            tags.AddRange(await ReadMembersAsync(client, clan, ct));
            if (tags.Count >= _opt.SeasonBoostSamplePlayers)
            {
                break;
            }
        }
        return tags.Distinct().Take(_opt.SeasonBoostSamplePlayers).ToList();
    }

    private async Task<IReadOnlyList<string>> ReadMembersAsync(ClashRoyaleCrawlClient client, string clanTag, CancellationToken ct)
    {
        try
        {
            return await client.GetClanMemberTagsAsync(clanTag, ct);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Couldn't read clan {ClanTag} for the season boost check; skipping it", clanTag);
            return [];
        }
    }

    // An open circuit breaker fails every request, so it stops the whole check instead of being skipped player by player.
    private async Task<SeasonBoostDetection.Sample?> ReadSampleAsync(ClashRoyaleCrawlClient client, string tag, CancellationToken ct)
    {
        try
        {
            var profile = client.GetPlayerDataAsync(tag, ct);
            var battles = client.GetPlayerBattlelogAsync(tag, ct);
            await Task.WhenAll(profile, battles);
            return new SeasonBoostDetection.Sample(await profile, await battles);
        }
        catch (Exception ex) when (ex is not BrokenCircuitException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Couldn't read a sampled player for the season boost check; skipping them");
            return null;
        }
    }
}
