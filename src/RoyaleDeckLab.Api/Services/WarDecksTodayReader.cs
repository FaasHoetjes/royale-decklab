using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed class WarDecksTodayReader(ClanWarCache clanWars, IHttpClientFactory httpFactory)
{
    public async Task<WarDecksToday> ReadAsync(CrPlayer player, CancellationToken ct = default)
    {
        if (!ClanTag.TryParse(player.Clan?.Tag, out var clanTag))
        {
            return WarDecksToday.None;
        }

        var clanWar = await clanWars.GetAsync(clanTag, ct);
        if (!clanWar.IsBattleDay)
        {
            return WarDecksToday.None;
        }
        var member = clanWar.Members.FirstOrDefault(m => m.Tag == player.Tag);
        if (member is not { DecksUsedToday: > 0 } playedToday)
        {
            return WarDecksToday.None;
        }

        var client = new ClashRoyaleClient(httpFactory.CreateClient(nameof(ClashRoyaleClient)));
        var battleLog = await client.GetPlayerBattlelogAsync(player.Tag, ct);
        return WarDecksToday.From(playedToday.DecksUsedToday, battleLog);
    }
}
