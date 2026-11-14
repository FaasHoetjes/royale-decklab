using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

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
