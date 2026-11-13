namespace RoyaleDeckLab.Api.Clients;

/// <summary>Supercell's Clash Royale blog, where the balance updates are announced. There is no feed or API for them.</summary>
public sealed class SupercellBlogClient(HttpClient http)
{
    public const string ListingPath = "/en/games/clashroyale/blog/";

    public Task<string> GetPageAsync(string path, CancellationToken ct = default) => http.GetStringAsync(path, ct);
}
