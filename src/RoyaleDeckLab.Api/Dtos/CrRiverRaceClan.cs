namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrRiverRaceClan(
    string? Tag,
    int Fame,
    List<CrRiverRaceParticipant>? Participants);
