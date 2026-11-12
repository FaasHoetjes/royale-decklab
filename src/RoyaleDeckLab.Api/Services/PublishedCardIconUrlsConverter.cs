using System.Text.Json;
using System.Text.Json.Serialization;
using RoyaleDeckLab.Api.Dtos;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Writes card art URLs in API responses as the site's versioned /img URLs. Inside the server they stay CR URLs,
/// which the catalog, the player cache and the art cache all key on.
/// </summary>
public sealed class PublishedCardIconUrlsConverter(CardArtCache art) : JsonConverter<CardIconUrls>
{
    public override CardIconUrls Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => throw new NotSupportedException("Card art URLs are only ever sent, never received.");

    public override void Write(Utf8JsonWriter writer, CardIconUrls value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        WriteUrl(writer, nameof(CardIconUrls.Medium), value.Medium, options);
        WriteUrl(writer, nameof(CardIconUrls.EvolutionMedium), value.EvolutionMedium, options);
        WriteUrl(writer, nameof(CardIconUrls.HeroMedium), value.HeroMedium, options);
        writer.WriteEndObject();
    }

    private void WriteUrl(Utf8JsonWriter writer, string name, string? url, JsonSerializerOptions options)
    {
        var property = options.PropertyNamingPolicy?.ConvertName(name) ?? name;
        if (url is null)
        {
            writer.WriteNull(property);
            return;
        }
        writer.WriteString(property, art.PublishedUrl(url));
    }
}
