using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Maps request details onto the few fixed values the stats keep, so no free text is ever stored.</summary>
public static partial class StatsClassify
{
    public static readonly IReadOnlySet<string> Tools = new HashSet<string>
    {
        "home", "generator", "builder", "upgrades", "best-decks", "cards", "card", "clan", "faq",
    };

    public static readonly IReadOnlySet<string> Sources = new HashSet<string>
    {
        "direct", "reddit", "ai", "google", "bing", "duckduckgo", "discord", "youtube", "x", "facebook", "instagram", "other",
    };

    public static bool IsBot(string? userAgent) => string.IsNullOrWhiteSpace(userAgent) || BotRegex().IsMatch(userAgent);

    public static string Device(string? userAgent) => userAgent is not null && PhoneRegex().IsMatch(userAgent) ? "phone" : "desktop";

    /// <summary>Cloudflare's two-letter country, or XX/T1 for unknown and Tor.</summary>
    public static string? Country(string? header)
    {
        var value = header?.Trim().ToUpperInvariant();
        return value is { Length: 2 } && char.IsAsciiLetterUpper(value[0]) && char.IsAsciiLetterOrDigit(value[1]) ? value : null;
    }

    /// <summary>The site a visit came from, from the referrer's host name. Empty means typed in or opened from an app.</summary>
    public static string Source(string? referrerHost)
    {
        var host = referrerHost?.Trim().ToLowerInvariant().TrimEnd('.');
        if (string.IsNullOrEmpty(host))
        {
            return "direct";
        }
        if (host.StartsWith("www.", StringComparison.Ordinal))
        {
            host = host[4..];
        }
        bool Is(params string[] domains) => domains.Any(d => host == d || host.EndsWith("." + d, StringComparison.Ordinal));

        if (Is("royaledecklab.com")) return "direct";
        if (Is("reddit.com", "redd.it")) return "reddit";
        if (Is("chatgpt.com", "openai.com", "perplexity.ai", "claude.ai", "gemini.google.com", "copilot.microsoft.com")) return "ai";
        if (GoogleRegex().IsMatch(host)) return "google";
        if (Is("bing.com")) return "bing";
        if (Is("duckduckgo.com")) return "duckduckgo";
        if (Is("discord.com", "discordapp.com", "discord.gg")) return "discord";
        if (Is("youtube.com", "youtu.be")) return "youtube";
        if (Is("x.com", "twitter.com", "t.co")) return "x";
        if (Is("facebook.com", "fb.com")) return "facebook";
        if (Is("instagram.com")) return "instagram";
        return "other";
    }

    /// <summary>
    /// A campaign link's utm_source as one of the <see cref="Sources"/>: a known name such as "reddit", or a site
    /// such as "chatgpt.com", which ChatGPT adds to its links. Null when the link had none.
    /// </summary>
    public static string? UtmSource(string? value)
    {
        var name = value?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(name))
        {
            return null;
        }
        if (name == "twitter")
        {
            return "x";
        }
        if (name.Contains('.'))
        {
            return Source(name);
        }
        return name != "direct" && Sources.Contains(name) ? name : "other";
    }

    /// <summary>A campaign link's utm_campaign, kept only as a short plain name.</summary>
    public static string? Campaign(string? value)
    {
        var name = value?.Trim().ToLowerInvariant();
        return name is not null && CampaignRegex().IsMatch(name) ? name : null;
    }

    [GeneratedRegex(@"bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|okhttp|go-http", RegexOptions.IgnoreCase)]
    private static partial Regex BotRegex();

    [GeneratedRegex("Mobi|Android|iPhone|iPad|iPod", RegexOptions.IgnoreCase)]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"^[a-z0-9][a-z0-9._-]{0,31}$")]
    private static partial Regex CampaignRegex();

    [GeneratedRegex(@"(^|\.)google\.[a-z.]{2,6}$")]
    private static partial Regex GoogleRegex();
}
