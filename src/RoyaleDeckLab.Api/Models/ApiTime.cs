using System.Globalization;

namespace RoyaleDeckLab.Api.Models;

public static class ApiTime
{
    private const string Format = "yyyyMMdd'T'HHmmss.fff'Z'";

    public static DateTimeOffset? Parse(string? value)
    {
        var isParsed = DateTimeOffset.TryParseExact(
            value,
            Format,
            CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal,
            out var time);
        return isParsed ? time : null;
    }
}
