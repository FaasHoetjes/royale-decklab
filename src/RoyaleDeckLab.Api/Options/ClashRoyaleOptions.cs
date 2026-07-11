namespace RoyaleDeckLab.Api.Options;

public sealed class ClashRoyaleOptions
{
    public const string SectionName = "ClashRoyale";

    public string BaseUrl { get; set; } = "https://api.clashroyale.com/v1";

    public string ApiKey { get; set; } = "";
}
