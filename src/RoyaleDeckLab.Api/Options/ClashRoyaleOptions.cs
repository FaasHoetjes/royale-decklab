namespace RoyaleDeckLab.Api.Options;

/// <summary>Connection settings for the official Clash Royale API.</summary>
public sealed class ClashRoyaleOptions
{
    public const string SectionName = "ClashRoyale";

    public string BaseUrl { get; set; } = "https://api.clashroyale.com/v1";

    /// <summary>
    /// Bearer token from https://developer.clashroyale.com, bound to the server's
    /// outbound IP. Read from config/env (CLASH_ROYALE_API_KEY), never committed.
    /// </summary>
    public string ApiKey { get; set; } = "";
}
