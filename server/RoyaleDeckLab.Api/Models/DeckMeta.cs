namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// Aggregated stats for one deck across the sampled battles. <see cref="Confidence"/>
/// is the Wilson lower bound on the win rate (the displayed rate); ranking combines
/// it with <see cref="DomainMath.PopularityWeight"/> so a deck few players run can't
/// top the list on win rate alone.
/// </summary>
public sealed class DeckMeta
{
    public required int[] CardIds { get; init; }
    public required double WinRate { get; init; }
    public required double Confidence { get; init; }
    public required int Uses { get; init; }

    /// <summary>Distinct top players who ran this deck within the sample window.</summary>
    public int? Players { get; init; }

    /// <summary>Fraction of sampled players who ran this deck (0-1).</summary>
    public double? PickRate { get; init; }

    public IReadOnlyList<CardVersion>? CardVersions { get; init; }
}
