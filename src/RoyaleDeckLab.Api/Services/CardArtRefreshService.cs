namespace RoyaleDeckLab.Api.Services;

public sealed class CardArtRefreshService(
    CardCatalog catalog,
    CardArtCache art,
    ILogger<CardArtRefreshService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromMinutes(1);
    private const int ParallelDownloads = 4;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                var succeeded = await TryRefreshAllAsync(stoppingToken);
                await Task.Delay(succeeded ? Interval : RetryDelay, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    private async Task<bool> TryRefreshAllAsync(CancellationToken ct)
    {
        try
        {
            await RefreshAllAsync(ct);
            return true;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Card art refresh failed; retrying in {Delay}", RetryDelay);
            return false;
        }
    }

    private async Task RefreshAllAsync(CancellationToken ct)
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
            catch (Exception ex) when (!token.IsCancellationRequested)
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
