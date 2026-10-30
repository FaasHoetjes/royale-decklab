using System.Text.Json.Serialization;

namespace RoyaleDeckLab.Api.Models;

public sealed record WarDeckResult
{
    public required IReadOnlyList<ScoredDeck> Decks { get; init; }
    public required double TotalScore { get; init; }
    public required IReadOnlyList<ScoredDeck> Alternatives { get; init; }

    /// <summary>The popularity gate (minimum distinct players) whose pool the lineup was picked from.</summary>
    [JsonIgnore]
    public int PoolMinPlayers { get; init; }
}
