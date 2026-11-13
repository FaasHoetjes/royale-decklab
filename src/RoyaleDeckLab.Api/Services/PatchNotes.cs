using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Services;

public sealed record BlogPost(string Title, string Path, DateTimeOffset PublishDate);

/// <summary>One balance update in a post. <see cref="Key"/> stays the same however often the post is read.</summary>
public sealed record PatchNote(string Key, DateOnly LiveOn);

/// <summary>Reads the balance updates off Supercell's blog pages.</summary>
public static partial class PatchNotes
{
    private const string ReleaseNotesPath = "/games/clashroyale/blog/release-notes/";

    [GeneratedRegex("""<script id="__NEXT_DATA__"[^>]*>(.*?)</script>""", RegexOptions.Singleline)]
    private static partial Regex PageDataRegex();

    // A post can gain a section for a later update instead of a new post, as October 2026's did on the 19th.
    [GeneratedRegex(@"Balance Update\s*[–—-]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?\b")]
    private static partial Regex UpdateHeadingRegex();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex TagRegex();

    /// <summary>The Clash Royale release-notes posts the blog listing links to, in English.</summary>
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
            if (Text(item, "linkUrl") is { } path && path.Contains(ReleaseNotesPath, StringComparison.Ordinal)
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

    /// <summary>The updates a balance post announces: one per "Balance Update – October 19th" heading, else the post itself.</summary>
    public static IReadOnlyList<PatchNote> ParseArticle(string html, BlogPost post)
    {
        var slug = post.Path.TrimEnd('/').Split('/')[^1];
        var published = DateOnly.FromDateTime(post.PublishDate.UtcDateTime);
        var text = WebUtility.HtmlDecode(TagRegex().Replace(html, " "));
        var notes = UpdateHeadingRegex().Matches(text)
            .Select(m => LiveOn(m, published))
            .Distinct()
            .Select(day => new PatchNote($"{slug}#{day:yyyy-MM-dd}", day))
            .ToList();
        return notes.Count > 0 ? notes : [new PatchNote($"{slug}#{published:yyyy-MM-dd}", published)];
    }

    // The headings leave out the year; a January heading in a post from December is next year's.
    private static DateOnly LiveOn(Match heading, DateOnly published)
    {
        var month = DateTime.ParseExact(heading.Groups[1].Value, "MMMM", CultureInfo.InvariantCulture).Month;
        var day = int.Parse(heading.Groups[2].Value, CultureInfo.InvariantCulture);
        var date = new DateOnly(published.Year, month, Math.Min(day, DateTime.DaysInMonth(published.Year, month)));
        return date < published.AddMonths(-6) ? date.AddYears(1) : date;
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
