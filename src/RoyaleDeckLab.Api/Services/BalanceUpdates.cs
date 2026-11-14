using System.Globalization;
using System.Text.RegularExpressions;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Supercell's balance updates as read off the blog, matched to cards. They don't line up with seasons: a season can
/// have none, or two.
/// </summary>
public static partial class BalanceUpdates
{
    [GeneratedRegex(@"\([^)]*\)")]
    private static partial Regex AsideRegex();

    [GeneratedRegex(@"\s*&\s*")]
    private static partial Regex AndRegex();

    [GeneratedRegex("[^a-z0-9]")]
    private static partial Regex NotLetterOrDigitRegex();

    private const string HeroPrefix = "Hero ";
    private const string EvoSuffix = " Evolution";

    /// <summary>
    /// The updates that went live during the battles a card's change compares: from the start of last patch, or of
    /// this one when only last patch's numbers are in. Newest first.
    /// </summary>
    public static IReadOnlyList<BalanceUpdate> During(IEnumerable<BalanceUpdate> updates, CardStatsResponse stats)
    {
        var start = stats.PreviousSince ?? stats.Since;
        if (start is null)
        {
            return [];
        }
        var from = DateOnly.FromDateTime(DateTimeOffset.Parse(start, CultureInfo.InvariantCulture).UtcDateTime);
        return updates.Where(u => u.LiveFrom >= from).OrderByDescending(u => u.LiveFrom).ToList();
    }

    /// <summary>
    /// Each change matched to the cards its title names. A title naming a card the catalog doesn't have is passed to
    /// <paramref name="onUnmatched"/> and left out, as is an update left with no changes. A card changed twice in one
    /// update gets one change saying both, a line each.
    /// </summary>
    public static IReadOnlyList<BalanceUpdate> Resolve(
        IEnumerable<PostedUpdate> posted, IReadOnlyList<CatalogCard> cards, Action<string> onUnmatched)
    {
        var idByName = cards.GroupBy(c => Key(c.Name)).ToDictionary(g => g.Key, g => g.First().Id);
        return posted.Select(update =>
        {
            var changes = new List<BalanceChange>();
            foreach (var change in update.Changes)
            {
                if (CardsNamed(change.Title, idByName) is not { } versions)
                {
                    onUnmatched(change.Title);
                    continue;
                }
                foreach (var version in versions)
                {
                    var earlier = changes.FindIndex(c => c.CardId == version.CardId && c.Version == version.Version);
                    if (earlier >= 0)
                    {
                        changes[earlier] = changes[earlier] with { Summary = $"{changes[earlier].Summary}\n{change.Summary}" };
                    }
                    else
                    {
                        changes.Add(new BalanceChange(version.CardId, version.Version, change.Kind, change.Summary));
                    }
                }
            }
            return new BalanceUpdate(update.Day, update.NotesUrl, changes);
        }).Where(u => u.Changes.Count > 0).ToList();
    }

    // Titles read like "Cannon Evolution", "Hero Ice Wizard", "Mortar & Mortar Evolution" or "Rascals (Boy)".
    private static IReadOnlyList<CardVersion>? CardsNamed(string title, Dictionary<string, int> idByName)
    {
        var versions = new List<CardVersion>();
        foreach (var part in AndRegex().Split(AsideRegex().Replace(title, "")))
        {
            var name = part.Trim();
            var version = CardVersionKind.Normal;
            if (name.StartsWith(HeroPrefix, StringComparison.OrdinalIgnoreCase))
            {
                name = name[HeroPrefix.Length..];
                version = CardVersionKind.Hero;
            }
            else if (name.EndsWith(EvoSuffix, StringComparison.OrdinalIgnoreCase))
            {
                name = name[..^EvoSuffix.Length];
                version = CardVersionKind.Evo;
            }
            if (!idByName.TryGetValue(Key(name), out var id))
            {
                return null;
            }
            versions.Add(new CardVersion(id, version));
        }
        return versions;
    }

    // Without case or punctuation, so a stray space or hyphen in the notes doesn't hide a card.
    private static string Key(string name) => NotLetterOrDigitRegex().Replace(name.ToLowerInvariant(), "");
}
