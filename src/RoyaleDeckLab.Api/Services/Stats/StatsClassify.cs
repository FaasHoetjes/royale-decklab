using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Services.Stats;

/// <summary>Maps request details onto the few fixed values the stats keep, so no free text is ever stored.</summary>
public static partial class StatsClassify
{
    public static readonly IReadOnlySet<string> Tools = new HashSet<string>
    {
        "home", "generator", "builder", "upgrades", "best-decks", "cards", "card", "faq",
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

    [GeneratedRegex(@"bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|okhttp|go-http", RegexOptions.IgnoreCase)]
    private static partial Regex BotRegex();

    [GeneratedRegex("Mobi|Android|iPhone|iPad|iPod", RegexOptions.IgnoreCase)]
    private static partial Regex PhoneRegex();

    [GeneratedRegex(@"(^|\.)google\.[a-z.]{2,6}$")]
    private static partial Regex GoogleRegex();
}
