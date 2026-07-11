using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Models;

public static partial class PlayerTag
{
    [GeneratedRegex("^[0289PYLQGRJCUV]{3,14}$", RegexOptions.IgnoreCase)]
    private static partial Regex TagRegex();

    public static bool IsValid(string? tag)
        => !string.IsNullOrEmpty(tag) && TagRegex().IsMatch(tag.TrimStart('#'));
}
