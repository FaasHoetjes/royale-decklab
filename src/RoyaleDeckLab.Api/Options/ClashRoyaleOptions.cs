namespace RoyaleDeckLab.Api.Options;

public sealed class ClashRoyaleOptions
{
    public const string SectionName = "ClashRoyale";

    public string BaseUrl { get; set; } = "https://api.clashroyale.com/v1";

    // CR API keys are bound to the server's outbound IP. Read from CLASH_ROYALE_API_KEY, never committed.
    public string ApiKey { get; set; } = "";
}
