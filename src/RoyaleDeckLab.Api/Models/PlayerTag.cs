using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// Clash Royale tag validation. Real tags use a fixed 14-character alphabet
/// (0289PYLQGRJCUV — no vowels or ambiguous glyphs) and are 3–14 characters.
/// Rejecting anything else up front saves a guaranteed-404 call against the
/// rate-limited CR API.
/// </summary>
public static partial class PlayerTag
{
    [GeneratedRegex("^[0289PYLQGRJCUV]{3,14}$", RegexOptions.IgnoreCase)]
    private static partial Regex TagRegex();

    /// <summary>True when <paramref name="tag"/> (with or without a leading '#') is a plausible CR tag.</summary>
    public static bool IsValid(string? tag)
        => !string.IsNullOrEmpty(tag) && TagRegex().IsMatch(tag.TrimStart('#'));
}
