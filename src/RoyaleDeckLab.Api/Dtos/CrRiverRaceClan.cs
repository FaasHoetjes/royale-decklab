namespace RoyaleDeckLab.Api.Dtos;

/// <summary>PeriodPoints are the medals the clan earned today.</summary>
public sealed record CrRiverRaceClan(
    string? Tag,
    string? Name,
    int Fame,
    int PeriodPoints,
    List<CrRiverRaceParticipant>? Participants);
