namespace RoyaleDeckLab.Api.Data;

/// <summary>SQLite takes one writer at a time, so every repository writing to meta.db queues here.</summary>
internal static class MetaWriteGate
{
    public static readonly SemaphoreSlim Instance = new(1, 1);
}
