using System.Net.Http.Json;
using System.Text.Json;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Clients;

public sealed class ClashRoyaleClient(HttpClient http)
{
    // CR API responses are camelCase; bind case-insensitively.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<CatalogCard>> GetAllCardsAsync(CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<CardsResponse>("cards", Json, ct);
        return data?.Items ?? [];
    }

    // Stays well below the API's 1000 cap (see MetaOptions.MaxWarClans) since war skill collapses past ~200.
    public async Task<IReadOnlyList<string>> GetTopWarClansAsync(int limit, CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<RankingsResponse>(
            $"locations/global/rankings/clanwars?limit={limit}", Json, ct);
        return data?.Items?.Select(c => c.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    public async Task<IReadOnlyList<string>> GetClanMemberTagsAsync(string clanTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var data = await http.GetFromJsonAsync<ClanResponse>($"clans/{encoded}", Json, ct);
        return data?.MemberList?.Select(m => m.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    // The CR API exposes only the last ~25 games.
    public async Task<IReadOnlyList<CrBattle>> GetPlayerBattlelogAsync(string playerTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(playerTag);
        var data = await http.GetFromJsonAsync<List<CrBattle>>($"players/{encoded}/battlelog", Json, ct);
        return data ?? [];
    }

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
