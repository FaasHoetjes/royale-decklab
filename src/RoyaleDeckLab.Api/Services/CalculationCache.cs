namespace RoyaleDeckLab.Api.Services;

/// <summary>Bounded results and shared in-flight work. Caller cancellation only stops that caller's wait.</summary>
public sealed class CalculationCache<T>(TimeProvider clock, int capacity = 512)
{
    private static readonly TimeSpan Ttl = TimeSpan.FromSeconds(60);
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new();
    private sealed class Entry(Func<Task<T>> calculate)
    {
        public Lazy<Task<T>> Work { get; } = new(calculate);
        public long? CompletedAt { get; set; }
    }

    public async Task<T> GetAsync(string key, Func<Task<T>> calculate, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        Entry entry;
        lock (_gate)
        {
            if (_entries.TryGetValue(key, out var existing)
                && (existing.CompletedAt is null || clock.GetElapsedTime(existing.CompletedAt.Value) < Ttl))
            {
                entry = existing;
            }
            else
            {
                _entries.Remove(key);
                if (_entries.Count >= capacity)
                {
                    var oldest = _entries.Where(p => p.Value.CompletedAt is not null)
                        .OrderBy(p => p.Value.CompletedAt).FirstOrDefault();
                    if (oldest.Value is null) throw new CalculationBusyException();
                    _entries.Remove(oldest.Key);
                }
                entry = new Entry(() => ComputeAsync(key, calculate));
                _entries.Add(key, entry);
            }
        }
        return await entry.Work.Value.WaitAsync(ct);
    }

    private async Task<T> ComputeAsync(string key, Func<Task<T>> calculate)
    {
        try
        {
            var result = await calculate();
            lock (_gate) _entries[key].CompletedAt = clock.GetTimestamp();
            return result;
        }
        catch
        {
            lock (_gate) _entries.Remove(key);
            throw;
        }
    }
}
