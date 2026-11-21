namespace RoyaleDeckLab.Api.Dtos;

public sealed record PlayerHeader(string Tag, string Name, string? ClanTag, string? ClanName, int? ClanBadgeId)
{
    public static PlayerHeader From(CrPlayer player)
        => new(player.Tag, player.Name, player.Clan?.Tag, player.Clan?.Name, player.Clan?.BadgeId);
}
