namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrClanSearch(List<CrClanSummary>? Items);

public sealed record CrClanSummary(
    string? Tag,
    string? Name,
    string? Type,
    int? BadgeId,
    int ClanWarTrophies,
    CrLocation? Location,
    int Members);

public sealed record CrLocation(string? Name);
