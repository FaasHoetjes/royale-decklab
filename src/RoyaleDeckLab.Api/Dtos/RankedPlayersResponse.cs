namespace RoyaleDeckLab.Api.Dtos;

public sealed record RankedPlayersResponse(List<RankedPlayer>? Items);

public sealed record RankedPlayer(string? Tag);
