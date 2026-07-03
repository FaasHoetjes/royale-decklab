using System.Text.Json;
using System.Text.Json.Serialization;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// JSON options used by the EF value converters that persist card ids / card
/// versions as text columns (compact camelCase, enums as lowercase strings),
/// keeping the stored format stable so existing meta.db rows round-trip.
/// </summary>
internal static class StorageJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}
