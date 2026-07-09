using System.Text.Json;
using System.Text.Json.Serialization;

namespace RoyaleDeckLab.Api.Data;

// Keep this format stable: existing meta.db rows were written with these options and must still round-trip.
internal static class StorageJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}
