using System.Diagnostics.CodeAnalysis;

namespace RoyaleDeckLab.Api.Models;

public sealed record ClanTag
{
    private ClanTag(string value) => Value = value;

    /// <summary>The tag as the CR API spells it: "#" and upper case.</summary>
    public string Value { get; }

    public static bool TryParse(string? raw, [NotNullWhen(true)] out ClanTag? tag)
    {
        tag = null;
        if (raw is null)
        {
            return false;
        }
        if (!PlayerTag.IsValid(raw))
        {
            return false;
        }

        tag = new ClanTag("#" + raw.TrimStart('#').ToUpperInvariant());
        return true;
    }

    public override string ToString() => Value;
}
