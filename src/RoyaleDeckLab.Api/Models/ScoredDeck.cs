namespace RoyaleDeckLab.Api.Models;

public sealed record ScoredDeck
{
    public required int[] CardIds { get; init; }
    public required double MetaWinRate { get; init; }
    public required double Confidence { get; init; }
    public required int Uses { get; init; }
    public required int Players { get; init; }
    public required double PickRate { get; init; }
    public required double PlayerScore { get; init; }
    public required IReadOnlyList<PlayerItemLevel> Cards { get; init; }
    public IReadOnlyList<CardVersion>? CardVersions { get; init; }
    public IReadOnlyList<CardVersion>? MetaCardVersions { get; init; }
}
