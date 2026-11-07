using System.Threading.RateLimiting;

namespace RoyaleDeckLab.Api.Services;

public sealed class CalculationBusyException : Exception;

/// <summary>One CPU budget shared by generation and advice; bounds both waiting and running work.</summary>
public sealed class CalculationScheduler : IDisposable
{
    private readonly ConcurrencyLimiter _limiter;
    private readonly TimeSpan _deadline;

    public CalculationScheduler() : this(Math.Clamp(Environment.ProcessorCount / 2, 1, 4), 32, TimeSpan.FromSeconds(10)) { }

    public CalculationScheduler(int permits, int queueLimit, TimeSpan deadline)
    {
        _deadline = deadline;
        _limiter = new(new ConcurrencyLimiterOptions
        {
            PermitLimit = permits, QueueLimit = queueLimit, QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
        });
    }

    public async Task<T> RunAsync<T>(Func<CancellationToken, T> calculate)
    {
        using var timeout = new CancellationTokenSource(_deadline);
        try
        {
            using var lease = await _limiter.AcquireAsync(1, timeout.Token);
            if (!lease.IsAcquired) throw new CalculationBusyException();
            return await Task.Run(() =>
            {
                var result = calculate(timeout.Token);
                timeout.Token.ThrowIfCancellationRequested();
                return result;
            }, timeout.Token);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            throw new CalculationBusyException();
        }
    }

    public void Dispose() => _limiter.Dispose();
}
