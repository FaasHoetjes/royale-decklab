using System.Net.Http.Json;
using System.Text.Json;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

/// <summary>
/// Typed HttpClient for the official Clash Royale API. The Bearer token and base
/// address are configured once on the client in Program.cs (AddHttpClient), so
/// each call here is just the path. Replaces the three Bun api/* classes
/// (cards.ts, meta.ts, player.ts). Wire shapes live in <c>Dtos/</c>.
/// </summary>
public sealed class ClashRoyaleClient(HttpClient http)
{
    // CR API responses are camelCase; bind case-insensitively.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>Full card catalog. First cut: regular cards only (skips tower troops).</summary>
    public async Task<IReadOnlyList<CatalogCard>> GetAllCardsAsync(CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<CardsResponse>("cards", Json, ct);
        return data?.Items ?? [];
    }

    /// <summary>
    /// Top war clans' tags, strongest first. The caller stays well below the API's
    /// 1000 cap (see MetaOptions.MaxWarClans) since war skill collapses past ~200.
    /// </summary>
    public async Task<IReadOnlyList<string>> GetTopWarClansAsync(int limit, CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<RankingsResponse>(
            $"locations/global/rankings/clanwars?limit={limit}", Json, ct);
        return data?.Items?.Select(c => c.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    /// <summary>A clan's current roster (up to 50 members). Throws on failure so the caller can skip just this clan.</summary>
    public async Task<IReadOnlyList<string>> GetClanMemberTagsAsync(string clanTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var data = await http.GetFromJsonAsync<ClanResponse>($"clans/{encoded}", Json, ct);
        return data?.MemberList?.Select(m => m.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    /// <summary>A player's recent battle log (the API exposes the last ~25 games).</summary>
    public async Task<IReadOnlyList<CrBattle>> GetPlayerBattlelogAsync(string playerTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(playerTag);
        var data = await http.GetFromJsonAsync<List<CrBattle>>($"players/{encoded}/battlelog", Json, ct);
        return data ?? [];
    }

    /// <summary>Full player profile incl. their card collection.</summary>
    public async Task<CrPlayer> GetPlayerDataAsync(string playerTag, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(playerTag))
        {
            throw new ArgumentException("Player tag is required", nameof(playerTag));
        }
        var encoded = Uri.EscapeDataString(playerTag);
        var player = await http.GetFromJsonAsync<CrPlayer>($"players/{encoded}", Json, ct);
        return player ?? throw new InvalidOperationException($"Empty player response for {playerTag}");
    }
}
