namespace RoyaleDeckLab.Api.Dtos;

/// <summary>The game mode of a battle — Name distinguishes "CW_Battle_1v1" from modifier modes.</summary>
public sealed record CrGameMode(int? Id, string? Name);
