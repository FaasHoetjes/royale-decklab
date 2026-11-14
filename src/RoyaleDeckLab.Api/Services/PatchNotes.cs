using System.Globalization;
using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record BlogPost(string Title, string Path, DateTimeOffset PublishDate);

/// <summary>
/// One balance update. It's known by its day alone, so a post that is renamed or reposted doesn't bring its updates
/// back as new ones.
/// </summary>
public sealed record PatchNote(string Key, DateOnly Day, long LiveFromMs);

public static partial class PatchNotes
{
    // Balance posts aren't all under release-notes: August 2026's is under news.
    private const string BlogPath = "/games/clashroyale/blog/";

    [GeneratedRegex("""<script id="__NEXT_DATA__"[^>]*>(.*?)</script>""", RegexOptions.Singleline)]
    private static partial Regex PageDataRegex();

    // A post can gain a section for a later update instead of a new post, as October 2026's did on the 19th.
    [GeneratedRegex(@"Balance Update\s*[–—-]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b", RegexOptions.IgnoreCase)]
    private static partial Regex UpdateHeadingRegex();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex TagRegex();

    [GeneratedRegex(@"\s+")]
    private static partial Regex SpaceRegex();

    // The share of the change, as in "212 → 202 (-5%)": the numbers already say it.
    [GeneratedRegex(@"\s*\([+\-−–]?\d+(?:[.,]\d+)?\s*%\)")]
    private static partial Regex ShareRegex();

    [GeneratedRegex(@"^([^:→]+):\s*")]
    private static partial Regex StatNameRegex();

    private const int MaxSummaryLines = 3;

    public static string ListingPage(int page) => page <= 1 ? "/en/games/clashroyale/blog/" : $"/en/games/clashroyale/blog/page/{page}/";

    /// <summary>The English Clash Royale posts a blog listing page links to.</summary>
    public static IReadOnlyList<BlogPost> ParseListing(string html)
    {
        if (PageDataRegex().Match(html) is not { Success: true } data)
        {
            return [];
        }
        using var doc = JsonDocument.Parse(data.Groups[1].Value);
        var posts = new Dictionary<string, BlogPost>();
        foreach (var item in Objects(doc.RootElement))
        {
            if (Text(item, "linkUrl") is { } path
                && path.IndexOf(BlogPath, StringComparison.Ordinal) is var at and >= 0
                && path.Length > at + BlogPath.Length
                && Text(item, "title") is { } title
                && Text(item, "publishDate") is { } published
                && DateTimeOffset.TryParse(published, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var publishDate)
                && Text(item, "locale") is null or "en")
            {
                posts.TryAdd(path, new BlogPost(title.Trim(), path, publishDate));
            }
        }
        return posts.Values.ToList();
    }

    public static bool IsBalanceUpdate(BlogPost post)
        => post.Title.Contains("balance", StringComparison.OrdinalIgnoreCase)
           && !post.Title.Contains("merge tactics", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// One update per "Balance Update – October 19th" heading. None means the page didn't come through as expected,
    /// as every balance post since May 2026 has them.
    /// </summary>
    public static IReadOnlyList<PatchNote> ParseArticle(string html, BlogPost post)
    {
        var text = WebUtility.HtmlDecode(TagRegex().Replace(html, " "));
        return UpdateHeadingRegex().Matches(text)
            .Select(m => Day(m, post.PublishDate))
            .Distinct()
            .Select(day => new PatchNote($"balance-update#{day:yyyy-MM-dd}", day, LiveFrom(day, post.PublishDate)))
            .ToList();
    }

    /// <summary>
    /// The cards each update changed, read from the page data: a "NERFS", "BUFFS" or "REWORKS" heading gives the
    /// kind of the card blocks under it. Bug fixes and other sections are left out, as is Supercell's reasoning.
    /// </summary>
    public static IReadOnlyList<PostedUpdate> ParseUpdates(string html, BlogPost post)
    {
        if (PageDataRegex().Match(html) is not { Success: true } data)
        {
            return [];
        }
        using var doc = JsonDocument.Parse(data.Groups[1].Value);
        if (BodyBlocks(doc.RootElement) is not { } blocks)
        {
            return [];
        }

        var updates = new List<(DateOnly Day, List<PostedChange> Changes)>();
        BalanceChangeKind? kind = null;
        foreach (var block in blocks.EnumerateArray())
        {
            if (Text(block, "__typename") == "FeatureBlock")
            {
                if (updates.Count > 0 && kind is { } blockKind && Text(block, "title") is { } title && !string.IsNullOrWhiteSpace(title))
                {
                    updates[^1].Changes.Add(new PostedChange(Clean(title), blockKind, Summary(block)));
                }
                continue;
            }
            foreach (var heading in Headings(block))
            {
                if (UpdateHeadingRegex().Match(heading) is { Success: true } match)
                {
                    updates.Add((Day(match, post.PublishDate), []));
                    kind = null;
                }
                else
                {
                    kind = KindOf(heading);
                }
            }
        }

        var notesUrl = $"https://supercell.com{post.Path}";
        return updates
            .GroupBy(u => u.Day)
            .Select(g => new PostedUpdate(g.Key, notesUrl, g.SelectMany(u => u.Changes).ToList()))
            .ToList();
    }

    private static BalanceChangeKind? KindOf(string heading)
    {
        var upper = heading.ToUpperInvariant();
        if (upper.Contains("NERF"))
        {
            return BalanceChangeKind.Nerf;
        }
        if (upper.Contains("BUFF"))
        {
            return BalanceChangeKind.Buff;
        }
        return upper.Contains("REWORK") ? BalanceChangeKind.Rework : null;
    }

    private static JsonElement? BodyBlocks(JsonElement root)
    {
        foreach (var item in Objects(root))
        {
            if (!item.TryGetProperty("bodyCollection", out var body))
            {
                continue;
            }
            if (body.ValueKind == JsonValueKind.Array)
            {
                return body;
            }
            if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
            {
                return items;
            }
        }
        return null;
    }

    // A section heading is either a text block's title or a heading inside its text.
    private static IEnumerable<string> Headings(JsonElement block)
    {
        var headings = new List<string>();
        if (Text(block, "title") is { } title && !string.IsNullOrWhiteSpace(title))
        {
            headings.Add(title);
        }
        if (RichText(block, "text") is { } doc && doc.TryGetProperty("content", out var nodes) && nodes.ValueKind == JsonValueKind.Array)
        {
            foreach (var node in nodes.EnumerateArray())
            {
                if (IsHeading(node))
                {
                    var lines = new List<string>();
                    CollectLines(node, lines);
                    headings.Add(string.Join(' ', lines));
                }
            }
        }
        return headings;
    }

    private static string Summary(JsonElement block)
    {
        if (RichText(block, "featureText") is not { } doc)
        {
            return "";
        }
        var lines = new List<string>();
        CollectLines(doc, lines);
        return string.Join('\n', lines
            .Select(line => StatNameRegex().Replace(ShareRegex().Replace(line, ""), "$1 ").Trim())
            .Where(line => line.Length > 0)
            .Take(MaxSummaryLines));
    }

    private static JsonElement? RichText(JsonElement block, string name)
        => block.TryGetProperty(name, out var field) && field.ValueKind == JsonValueKind.Object
           && field.TryGetProperty("json", out var doc) && doc.ValueKind == JsonValueKind.Object
            ? doc
            : null;

    private static bool IsHeading(JsonElement node) => Text(node, "nodeType")?.StartsWith("heading", StringComparison.Ordinal) == true;

    // Stats sometimes follow on without a line break, as in "(-23%)Rage Duration:", so a bold stat name after other
    // text starts a line too.
    private static void CollectLines(JsonElement node, List<string> lines)
    {
        var line = new StringBuilder();
        var hasValue = false;

        void Break()
        {
            var text = Clean(line.ToString());
            if (text.Length > 0)
            {
                lines.Add(text);
            }
            line.Clear();
            hasValue = false;
        }

        void Walk(JsonElement current)
        {
            if (Text(current, "nodeType") == "text")
            {
                var isBold = current.TryGetProperty("marks", out var marks) && marks.ValueKind == JsonValueKind.Array
                    && marks.EnumerateArray().Any(m => Text(m, "type") == "bold");
                if (isBold && hasValue)
                {
                    Break();
                }
                var parts = (Text(current, "value") ?? "").Split('\n');
                for (var i = 0; i < parts.Length; i++)
                {
                    if (i > 0)
                    {
                        Break();
                    }
                    line.Append(parts[i]);
                    hasValue |= !isBold && !string.IsNullOrWhiteSpace(parts[i]);
                }
                return;
            }
            if (current.TryGetProperty("content", out var children) && children.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in children.EnumerateArray())
                {
                    Walk(child);
                }
            }
            if (Text(current, "nodeType") is "paragraph" or "list-item" || IsHeading(current))
            {
                Break();
            }
        }

        Walk(node);
        Break();
    }

    private static string Clean(string text) => SpaceRegex().Replace(text, " ").Trim();

    // An update posted on its own day went live about when it was posted; for any other day only the date is known.
    private static long LiveFrom(DateOnly day, DateTimeOffset published)
        => day == DateOnly.FromDateTime(published.UtcDateTime)
            ? published.ToUnixTimeMilliseconds()
            : new DateTimeOffset(day.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero).ToUnixTimeMilliseconds();

    // The headings leave out the year: it's the one that puts the day nearest the post, so a January heading in a
    // December post is next year's and a December one in a January post last year's.
    private static DateOnly Day(Match heading, DateTimeOffset published)
    {
        var month = DateTime.ParseExact(heading.Groups[1].Value, "MMMM", CultureInfo.InvariantCulture).Month;
        var day = int.Parse(heading.Groups[2].Value, CultureInfo.InvariantCulture);
        var postedOn = DateOnly.FromDateTime(published.UtcDateTime);
        return new[] { postedOn.Year - 1, postedOn.Year, postedOn.Year + 1 }
            .Select(year => new DateOnly(year, month, Math.Min(day, DateTime.DaysInMonth(year, month))))
            .MinBy(date => Math.Abs(date.DayNumber - postedOn.DayNumber));
    }

    private static IEnumerable<JsonElement> Objects(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            yield return element;
            foreach (var property in element.EnumerateObject())
            {
                foreach (var nested in Objects(property.Value))
                {
                    yield return nested;
                }
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                foreach (var nested in Objects(item))
                {
                    yield return nested;
                }
            }
        }
    }

    private static string? Text(JsonElement item, string name)
        => item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}
