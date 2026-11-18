using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

public sealed class ClashRoyaleClient(HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<CatalogCard>> GetAllCardsAsync(CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<CardsResponse>("cards", Json, ct);
        return data?.Items ?? [];
    }

    public async Task<IReadOnlyList<string>> GetTopWarClansAsync(int limit, CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<RankingsResponse>(
            $"locations/global/rankings/clanwars?limit={limit}", Json, ct);
        return data?.Items?.Select(c => c.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    public async Task<IReadOnlyList<string>> GetTopRankedPlayerTagsAsync(int limit, CancellationToken ct = default)
    {
        var data = await http.GetFromJsonAsync<RankedPlayersResponse>(
            $"locations/global/pathoflegend/players?limit={limit}", Json, ct);
        var tags = data?.Items?.Select(p => p.Tag) ?? [];
        return tags
            .OfType<string>()
            .Where(t => t.Length > 0)
            .ToList();
    }

    public async Task<IReadOnlyList<string>> GetClanMemberTagsAsync(string clanTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var data = await http.GetFromJsonAsync<ClanResponse>($"clans/{encoded}", Json, ct);
        return data?.MemberList?.Select(m => m.Tag).Where(t => !string.IsNullOrEmpty(t)).Cast<string>().ToList() ?? [];
    }

    /// <summary>The members seen online since <paramref name="seenSince"/>, and the ones whose last seen time isn't given.</summary>
    public async Task<IReadOnlyList<string>> GetActiveClanMemberTagsAsync(
        string clanTag, DateTimeOffset seenSince, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var data = await http.GetFromJsonAsync<ClanResponse>($"clans/{encoded}", Json, ct);
        return data?.MemberList?
            .Where(m => ApiTime.Parse(m.LastSeen) is not { } seen || seen >= seenSince)
            .Select(m => m.Tag)
            .Where(t => !string.IsNullOrEmpty(t))
            .Cast<string>()
            .ToList() ?? [];
    }

    public async Task<ClanResponse> GetClanAsync(string clanTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var clan = await http.GetFromJsonAsync<ClanResponse>($"clans/{encoded}", Json, ct);
        return clan ?? throw new InvalidOperationException("Empty clan response");
    }

    public async Task<IReadOnlyList<CrClanSummary>> SearchClansAsync(string name, int limit, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(name);
        var data = await http.GetFromJsonAsync<CrClanSearch>($"clans?name={encoded}&limit={limit}", Json, ct);
        return data?.Items ?? [];
    }

    /// <summary>Null for a clan that isn't in a river race this week: the API answers 404 for those.</summary>
    public async Task<CrRiverRace?> GetCurrentRiverRaceAsync(string clanTag, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        using var response = await http.GetAsync($"clans/{encoded}/currentriverrace", ct);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
        response.EnsureSuccessStatusCode();
        var race = await response.Content.ReadFromJsonAsync<CrRiverRace>(Json, ct);
        return race ?? throw new InvalidOperationException("Empty river race response");
    }

    public async Task<CrRiverRaceLog> GetRiverRaceLogAsync(string clanTag, int weeks, CancellationToken ct = default)
    {
        var encoded = Uri.EscapeDataString(clanTag);
        var log = await http.GetFromJsonAsync<CrRiverRaceLog>($"clans/{encoded}/riverracelog?limit={weeks}", Json, ct);
        return log ?? new CrRiverRaceLog([]);
    }

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
