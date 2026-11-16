namespace RoyaleDeckLab.Api.Models;

public sealed class DeckMeta
{
    public required int[] CardIds { get; init; }
    public required double WinRate { get; init; }

    /// <summary>Cautious win rate (<see cref="DomainMath.PosteriorQuantile"/>); what scoring ranks by.</summary>
    public required double Confidence { get; init; }
    public required int Uses { get; init; }

    /// <summary>Of <see cref="Uses"/>, the Crown Series rounds played at the league's own cap.</summary>
    public int? LeagueUses { get; init; }
    public int? Players { get; init; }
    public double? PickRate { get; init; }

    public IReadOnlyList<CardVersion>? CardVersions { get; init; }
}
