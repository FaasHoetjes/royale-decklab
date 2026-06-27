namespace RoyaleDeckLab.Api.Dtos;

/// <summary>The clan-war rankings response envelope ({ items: [...] }).</summary>
public sealed record RankingsResponse(List<ClanRef>? Items);
