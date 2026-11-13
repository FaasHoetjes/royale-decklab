using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Starts a new patch when Supercell's blog announces a balance update that has gone live.</summary>
public sealed class PatchNotesWatchService(
    IServiceScopeFactory scopeFactory,
    MetaCache cache,
    TimeProvider clock,
    IOptions<MetaOptions> options,
    ILogger<PatchNotesWatchService> logger) : BackgroundService
{
    // Marks the updates that were already out when the watch began, which mustn't start a patch, as read.
    private const string WatchStartedKey = "watch-started";

    private readonly MetaOptions _opt = options.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMilliseconds(_opt.PatchCheckIntervalMs);
        logger.LogInformation("Patch notes watch scheduled every {Minutes} min", interval.TotalMinutes);
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
                    logger.LogError(ex, "Patch notes check failed; retrying on the next tick");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
        }
    }

    public async Task CheckAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var blog = scope.ServiceProvider.GetRequiredService<SupercellBlogClient>();
        var store = scope.ServiceProvider.GetRequiredService<BattleRepository>();

        var posts = PatchNotes.ParseListing(await blog.GetPageAsync(SupercellBlogClient.ListingPath, ct));
        if (posts.Count == 0)
        {
            logger.LogError("The Clash Royale blog lists no release notes; has its layout changed? " +
                "Balance updates aren't detected until this is fixed, so set the patch boundary by hand meanwhile");
            return;
        }

        var notes = new List<PatchNote>();
        foreach (var post in posts.Where(PatchNotes.IsBalanceUpdate))
        {
            notes.AddRange(PatchNotes.ParseArticle(await blog.GetPageAsync(post.Path, ct), post));
        }

        var seen = store.GetSeenPatchNotes();
        if (!seen.Contains(WatchStartedKey))
        {
            await store.AddSeenPatchNotesAsync(notes.Select(n => n.Key).Append(WatchStartedKey), ct);
            logger.LogInformation("Patch notes watch initialised with {Count} balance updates already out", notes.Count);
            return;
        }

        // An update announced ahead of its day waits for that day.
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);
        var live = notes.Where(n => !seen.Contains(n.Key) && n.LiveOn <= today).Select(n => n.Key).ToList();
        if (live.Count == 0)
        {
            return;
        }
        await cache.StartPatchAsync(clock.GetUtcNow().ToUnixTimeMilliseconds(), $"Balance update {string.Join(", ", live)}", ct);
        await store.AddSeenPatchNotesAsync(live, ct);
    }
}
