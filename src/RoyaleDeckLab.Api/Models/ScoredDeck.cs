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

    /// <summary>
    /// Versions personalised to this player: any evo/hero they haven't unlocked is
    /// shown as normal, so the artwork is what they'd actually field.
    /// </summary>
    public IReadOnlyList<CardVersion>? CardVersions { get; init; }

    /// <summary>
    /// The raw versions the top players fielded (legal-capped, NOT personalised).
    /// Drives the positional evo/hero slot layout.
    /// </summary>
    public IReadOnlyList<CardVersion>? MetaCardVersions { get; init; }
}
