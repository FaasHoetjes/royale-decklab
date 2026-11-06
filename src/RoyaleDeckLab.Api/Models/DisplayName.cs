using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Models;

/// <summary>Player and clan names as the game shows them: names can carry colour markup like "&lt;c6&gt;Name".</summary>
public static partial class DisplayName
{
    [GeneratedRegex(@"</?c\d*>", RegexOptions.IgnoreCase)]
    private static partial Regex ColorCode();

    public static string Clean(string? name, string fallback)
    {
        var cleaned = name is null ? "" : ColorCode().Replace(name, "").Trim();
        return cleaned.Length > 0 ? cleaned : fallback;
    }
}
