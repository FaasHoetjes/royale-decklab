namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Player profile (the live API returns <c>cards</c> as a flat array).</summary>
public sealed record CrPlayer(string Tag, string Name, List<CrPlayerCard>? Cards);
