namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The player-facing view of a meta deck: its meta stats plus this player's fit
/// score, the player's own card objects, and two version lists. Port of the TS
/// <c>ScoredDeck</c>.
/// </summary>
public sealed record ScoredDeck
{
    public required int[] CardIds { get; init; }
    public required double MetaWinRate { get; init; }
    public required double Confidence { get; init; }
    public required int Uses { get; init; }
    public required int Players { get; init; }
    public required double PickRate { get; init; }
    public required double PlayerScore { get; init; }

    /// <summary>The player's own card objects for this deck (levels, icons) for display.</summary>
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
