namespace RoyaleDeckLab.Api.Services.Crawling;

public sealed record TrackedPlayer<TGroup>(
    string Tag, TGroup Group, long NextReadMs, long LastSeenMs, long NewestBattleMs, long WaitMs) where TGroup : struct;
