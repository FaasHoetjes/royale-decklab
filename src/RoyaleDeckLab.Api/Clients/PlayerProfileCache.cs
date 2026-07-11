using System.Collections.Concurrent;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

public sealed class PlayerProfileCache(IHttpClientFactory httpFactory, TimeProvider clock)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);

    private const int SweepThreshold = 256;

    private readonly ConcurrentDictionary<string, Entry> _entries = new();

    private sealed record Entry(long Stamp, Lazy<Task<CrPlayer>> Fetch);

    public async Task<CrPlayer> GetPlayerDataAsync(string playerTag, CancellationToken ct = default)
    {
        // "#2QGG92L9", "2qgg92l9" etc. are the same player to the CR API.
        var key = playerTag.TrimStart('#').ToUpperInvariant();
        if (_entries.Count > SweepThreshold)
        {
            SweepExpired();
        }

        while (true)
        {
            ct.ThrowIfCancellationRequested();
            var entry = _entries.GetOrAdd(key, _ => new Entry(
                clock.GetTimestamp(),
                new Lazy<Task<CrPlayer>>(() => FetchAsync(playerTag))));

            if (clock.GetElapsedTime(entry.Stamp) > Ttl)
            {
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                continue;
            }

            try
            {
                return await entry.Fetch.Value.WaitAsync(ct);
            }
            catch when (!ct.IsCancellationRequested)
            {
                _entries.TryRemove(KeyValuePair.Create(key, entry));
                throw;
            }
        }
    }

    private async Task<CrPlayer> FetchAsync(string playerTag)
    {
        var client = new ClashRoyaleClient(httpFactory.CreateClient(nameof(ClashRoyaleClient)));
        return await client.GetPlayerDataAsync(playerTag, CancellationToken.None);
    }

    private void SweepExpired()
    {
        foreach (var pair in _entries)
        {
            if (clock.GetElapsedTime(pair.Value.Stamp) > Ttl)
            {
                _entries.TryRemove(pair);
            }
        }
    }
}
