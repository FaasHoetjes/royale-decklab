using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Supercell's balance updates, typed in by hand from the official notes into Assets/balance-updates.json.
/// They don't line up with seasons: a season can have none, or two.
/// </summary>
public static class BalanceUpdates
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false) },
    };

    public static IReadOnlyList<BalanceUpdate> All { get; } = Load();

    /// <summary>
    /// The updates that went live during the battles a card's change compares: from the start of last patch, or of
    /// this one when only last patch's numbers are in. Newest first.
    /// </summary>
    public static IReadOnlyList<BalanceUpdate> During(CardStatsResponse stats)
    {
        var start = stats.PreviousSince ?? stats.Since;
        if (start is null)
        {
            return [];
        }
        var from = DateOnly.FromDateTime(DateTimeOffset.Parse(start, CultureInfo.InvariantCulture).UtcDateTime);
        return All.Where(u => u.LiveFrom >= from).ToList();
    }

    public static IReadOnlyList<BalanceUpdate> Parse(string json)
        => (JsonSerializer.Deserialize<List<BalanceUpdate>>(json, Json) ?? [])
            .OrderByDescending(u => u.LiveFrom)
            .ToList();

    private static IReadOnlyList<BalanceUpdate> Load()
    {
        using var stream = typeof(BalanceUpdates).Assembly.GetManifestResourceStream("BalanceUpdates.json")
            ?? throw new InvalidOperationException("The balance-updates.json resource is missing");
        using var reader = new StreamReader(stream);
        return Parse(reader.ReadToEnd());
    }
}
