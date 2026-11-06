namespace RoyaleDeckLab.Api.Dtos;

/// <summary>Clans lists every clan in the race, this one included.</summary>
public sealed record CrRiverRace(
    string? PeriodType,
    int PeriodIndex,
    CrRiverRaceClan? Clan,
    List<CrRiverRaceClan>? Clans);
