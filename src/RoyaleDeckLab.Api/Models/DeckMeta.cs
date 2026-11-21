namespace RoyaleDeckLab.Api.Models;

public sealed class DeckMeta
{
    public required int[] CardIds { get; init; }
    public required double WinRate { get; init; }

    /// <summary>
    /// The win rate scoring ranks by (<see cref="DomainMath.PosteriorQuantile"/>): cautious for war decks, the median
    /// for Crown Series Duel decks.
    /// </summary>
    public required double Confidence { get; init; }
    public required int Uses { get; init; }

    /// <summary>Of <see cref="Uses"/>, the Crown Series rounds played at the league's own cap.</summary>
    public int? LeagueUses { get; init; }
    public int? Players { get; init; }
    public double? PickRate { get; init; }

    public IReadOnlyList<CardVersion>? CardVersions { get; init; }
}
