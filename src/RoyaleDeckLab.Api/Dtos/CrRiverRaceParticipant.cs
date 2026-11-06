namespace RoyaleDeckLab.Api.Dtos;

public sealed record CrRiverRaceParticipant(
    string? Tag,
    int Fame,
    int DecksUsed,
    int DecksUsedToday);
