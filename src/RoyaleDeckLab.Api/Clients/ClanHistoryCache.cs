using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

public sealed class ClanHistoryCache
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(15);
    private const int PastWeeks = 4;
    private readonly IHttpClientFactory _httpFactory;
    private readonly TimeProvider _clock;
    private readonly int _capacity;
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.Ordinal);

    private sealed record Snapshot(CrRiverRaceLog Log, int? RaceWeek);
    private sealed record Entry(long Stamp, Lazy<Task<Snapshot>> Fetch);

    public ClanHistoryCache(IHttpClientFactory httpFactory, TimeProvider clock, int capacity = 256)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(capacity);
        _httpFactory = httpFactory;
        _clock = clock;
        _capacity = capacity;
    }

    public async Task<CrRiverRaceLog> GetAsync(ClanTag tag, Task<CrRiverRace?> currentRace, CancellationToken ct = default)
    {
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            Entry entry;
            lock (_gate)
            {
                if (!_entries.TryGetValue(tag.Value, out entry!) || _clock.GetElapsedTime(entry.Stamp) >= Ttl)
                {
                    foreach (var key in _entries.Where(pair => _clock.GetElapsedTime(pair.Value.Stamp) >= Ttl).Select(pair => pair.Key).ToArray())
                        _entries.Remove(key);
                    if (_entries.Count >= _capacity)
                        _entries.Remove(_entries.MinBy(pair => pair.Value.Stamp).Key);
                    entry = new Entry(_clock.GetTimestamp(), new Lazy<Task<Snapshot>>(() => FetchAsync(tag, currentRace)));
                    _entries[tag.Value] = entry;
                }
            }

            try
            {
                var snapshot = await entry.Fetch.Value.WaitAsync(ct);
                var race = await currentRace.WaitAsync(ct);
                if (snapshot.RaceWeek == race?.PeriodIndex / 7) return snapshot.Log;
                Remove(tag.Value, entry);
            }
            catch when (!ct.IsCancellationRequested)
            {
                Remove(tag.Value, entry);
                throw;
            }
        }
    }

    private async Task<Snapshot> FetchAsync(ClanTag tag, Task<CrRiverRace?> currentRace)
    {
        using var http = _httpFactory.CreateClient(nameof(ClashRoyaleClient));
        var log = new ClashRoyaleClient(http).GetRiverRaceLogAsync(tag.Value, PastWeeks, CancellationToken.None);
        await Task.WhenAll(log, currentRace);
        var compact = new CrRiverRaceLog((await log).Items?.Take(PastWeeks).Select(week => week with
        {
            Standings = week.Standings?.Where(standing => standing.Clan?.Tag == tag.Value).ToList(),
        }).ToList());
        return new Snapshot(compact, (await currentRace)?.PeriodIndex / 7);
    }

    private void Remove(string key, Entry entry)
    {
        lock (_gate)
        {
            if (_entries.TryGetValue(key, out var cached) && ReferenceEquals(cached, entry))
                _entries.Remove(key);
        }
    }
}
