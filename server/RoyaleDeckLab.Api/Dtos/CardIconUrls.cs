namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Icon URLs the CR API returns per card (normal / evolution / hero art).</summary>
public sealed record CardIconUrls(string? Medium, string? EvolutionMedium, string? HeroMedium);
