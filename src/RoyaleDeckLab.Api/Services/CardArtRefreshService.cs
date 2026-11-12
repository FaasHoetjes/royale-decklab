namespace RoyaleDeckLab.Api.Services;

/// <summary>Keeps every catalog card's art on disk and current, so new and replaced art reach the site within a cycle.</summary>
public sealed class CardArtRefreshService(
    CardCatalog catalog,
    CardArtCache art,
    ILogger<CardArtRefreshService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private const int ParallelDownloads = 4;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var timer = new PeriodicTimer(Interval);
            do
            {
                try
                {
                    await RefreshAllAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Card art refresh failed; retrying on the next tick");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
        }
    }

    public async Task RefreshAllAsync(CancellationToken ct)
    {
        var cards = await catalog.GetAsync(ct);
        var assets = cards
            .SelectMany(c => c.IconUrls?.AllUrls() ?? [])
            .Select(ToAsset)
            .OfType<ArtAsset>()
            .Distinct()
            .ToList();

        var failed = 0;
        var options = new ParallelOptions { MaxDegreeOfParallelism = ParallelDownloads, CancellationToken = ct };
        await Parallel.ForEachAsync(assets, options, async (asset, token) =>
        {
            try
            {
                await art.RefreshAsync(asset.Kind, asset.Hash, token);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                Interlocked.Increment(ref failed);
                logger.LogWarning(ex, "Refreshing card art {Kind}/{Hash} failed", asset.Kind, asset.Hash);
            }
        });
        logger.LogInformation("Checked {Count} card art images, {Failed} failed", assets.Count, failed);
    }

    private static ArtAsset? ToAsset(string url) =>
        CardArtCache.TryParseUrl(url, out var kind, out var hash) ? new ArtAsset(kind, hash) : null;

    private sealed record ArtAsset(string Kind, string Hash);
}
