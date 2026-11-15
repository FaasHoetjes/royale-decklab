namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// Caps the CR API requests the background crawls make at once, together: the war crawl and the Crown Series poll can
/// run at the same time, and their load on the API key shouldn't add up.
/// </summary>
public sealed class CrawlConcurrency
{
    public const int MaxRequests = 10;

    private readonly SemaphoreSlim _slots = new(MaxRequests, MaxRequests);

    public async Task<T> RunAsync<T>(Func<Task<T>> request, CancellationToken ct)
    {
        await _slots.WaitAsync(ct);
        try
        {
            return await request();
        }
        finally
        {
            _slots.Release();
        }
    }
}
