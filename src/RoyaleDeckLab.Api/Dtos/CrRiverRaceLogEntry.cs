namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrRiverRaceLogEntry(
    int SeasonId,
    int SectionIndex,
    string? CreatedDate,
    List<CrRiverRaceStanding>? Standings);
