namespace RoyaleDeckLab.Api.Models;

/// <summary>A clan in the river race: Fame moves its boat, MedalsToday ranks the day.</summary>
public sealed record RaceClan(
    string Tag,
    string Name,
    int Fame,
    int MedalsToday);
