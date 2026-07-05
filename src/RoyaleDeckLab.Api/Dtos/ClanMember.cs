namespace RoyaleDeckLab.Api.Dtos;

/// <summary>A clan member; only the tag is read (to fetch their battle log).</summary>
public sealed record ClanMember(string? Tag);
