using System.Text.Json;
using System.Text.Json.Serialization;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// JSON options used by the EF value converters that persist card ids / card
/// versions as text columns. Must produce output compatible with what the Bun
/// BattleStore wrote (compact camelCase, enums as lowercase strings) so the
/// existing meta.db rows round-trip.
/// </summary>
internal static class StorageJson
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
}
