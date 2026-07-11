namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrPlayer(
    string Tag,
    string Name,
    List<CrPlayerCard>? Cards);
