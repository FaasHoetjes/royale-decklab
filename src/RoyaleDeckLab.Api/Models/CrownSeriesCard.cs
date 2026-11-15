namespace RoyaleDeckLab.Api.Models;

/// <summary>A card as it was played in a Crown Series round, its level on the unified 1-16 scale.</summary>
public sealed record CrownSeriesCard(int Id, int Level, CardVersionKind Version);
