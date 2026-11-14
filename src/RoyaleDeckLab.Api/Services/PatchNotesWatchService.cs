using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class PatchNotesWatchService(
    IServiceScopeFactory scopeFactory,
    MetaCache cache,
    BalanceUpdateStore balanceUpdates,
    TimeProvider clock,
    IOptions<MetaOptions> options,
    ILogger<PatchNotesWatchService> logger) : BackgroundService
{
    // Marks the updates that were already out when the watch began, which mustn't start a patch, as read.
    private const string WatchStartedKey = "watch-started";

    // An update can be added to a post weeks after it went up (October 2026's gained one 13 days later), by which
    // time the post has slid off the first listing page.
    private static readonly TimeSpan RecheckPostsFor = TimeSpan.FromDays(60);
    private const int MaxListingPages = 5;

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
        var now = clock.GetUtcNow();

        var posts = await RecentPostsAsync(blog, now, ct);
        if (posts.Count == 0)
        {
            logger.LogError("The Clash Royale blog lists no posts; has its layout changed? " +
                "Balance updates aren't detected until this is fixed, so set the patch boundary by hand meanwhile");
            return;
        }

        var notes = new List<PatchNote>();
        var changes = new List<PostedUpdate>();
        var unreadable = 0;
        foreach (var post in posts.Where(PatchNotes.IsBalanceUpdate))
        {
            var html = await blog.GetPageAsync(post.Path, ct);
            var found = PatchNotes.ParseArticle(html, post);
            if (found.Count == 0)
            {
                logger.LogError("Balance post {Path} has no \"Balance Update – <date>\" headings; skipped", post.Path);
                unreadable++;
            }
            notes.AddRange(found);
            changes.AddRange(PatchNotes.ParseUpdates(html, post));
        }

        // Stored before anything below can return, as the updates that were out when the watch began are the ones
        // the Patch page shows first. An update announced ahead of its day waits for that day.
        var today = DateOnly.FromDateTime(now.UtcDateTime);
        await balanceUpdates.SaveAsync(changes.Where(u => u.Day <= today).ToList(), ct);

        var live = notes.Where(n => n.LiveFromMs <= now.ToUnixTimeMilliseconds()).ToList();
        var seen = store.GetSeenPatchNotes();
        if (!seen.Contains(WatchStartedKey))
        {
            // A post skipped now would bring its old updates back as new ones once it reads.
            if (unreadable > 0)
            {
                return;
            }
            await store.AddSeenPatchNotesAsync(live.Select(n => n.Key).Append(WatchStartedKey), ct);
            logger.LogInformation("Patch notes watch initialised with {Count} balance updates already out", live.Count);
            return;
        }

        var unseen = live.Where(n => !seen.Contains(n.Key)).ToList();
        if (unseen.Count == 0)
        {
            return;
        }
        var latest = unseen.MaxBy(n => n.LiveFromMs)!;
        await cache.StartPatchAsync(latest.LiveFromMs, $"Balance update of {latest.Day:yyyy-MM-dd}", ct);
        await store.AddSeenPatchNotesAsync(unseen.Select(n => n.Key), ct);
    }

    private async Task<List<BlogPost>> RecentPostsAsync(SupercellBlogClient blog, DateTimeOffset now, CancellationToken ct)
    {
        var posts = new List<BlogPost>();
        for (var page = 1; page <= MaxListingPages; page++)
        {
            var listed = PatchNotes.ParseListing(await blog.GetPageAsync(PatchNotes.ListingPage(page), ct));
            posts.AddRange(listed.Where(p => p.PublishDate >= now - RecheckPostsFor && posts.All(seen => seen.Path != p.Path)));
            if (listed.Count == 0 || listed.Min(p => p.PublishDate) < now - RecheckPostsFor)
            {
                break;
            }
        }
        return posts;
    }
}
