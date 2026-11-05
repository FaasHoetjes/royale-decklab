using System.Text.Json.Serialization;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <param name="Visitor">An HMAC of the visitor's IP address and browser with the month's secret.</param>
/// <param name="Tag">An HMAC of the player tag with the same secret, or empty.</param>
public sealed record StatsEvent(
    long AtMs, string Kind, byte[] Visitor, byte[] Tag, string Tool, string? Country, string? Device, string? Source,
    string? Campaign = null);

/// <summary>Narrows the stats to the visitors who, in the period, came from that source, country and device.</summary>
public sealed record StatsFilter(string? Source = null, string? Country = null, string? Device = null)
{
    [JsonIgnore]
    public bool IsEmpty => Source is null && Country is null && Device is null;
}

public sealed record StatsHour(string Hour, long Users, long Visitors);

public sealed record StatsTotal(string Metric, string Dim, long Value);

/// <summary>How long a visitor had the site in view on a day.</summary>
public sealed record VisitTime(DateOnly Day, byte[] Visitor, long Ms);
