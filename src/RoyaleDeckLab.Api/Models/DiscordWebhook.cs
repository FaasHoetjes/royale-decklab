using System.Diagnostics.CodeAnalysis;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// A Discord webhook as its id and token. The URL to post to is always rebuilt on discord.com from these two, so a
/// pasted URL can't make the server send requests anywhere else. Whoever has the token controls the webhook.
/// </summary>
public sealed partial class DiscordWebhook
{
    private static readonly HashSet<string> DiscordHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "discord.com",
        "discordapp.com",
        "ptb.discord.com",
        "canary.discord.com",
    };

    public DiscordWebhook(string id, string token)
    {
        if (!IdPattern().IsMatch(id) || !TokenPattern().IsMatch(token))
        {
            throw new FormatException("Not a Discord webhook id and token");
        }
        Id = id;
        Token = token;
    }

    public string Id { get; }

    public string Token { get; }

    public Uri Url => new($"https://discord.com/api/webhooks/{Id}/{Token}");

    public static bool TryParse(string? raw, [NotNullWhen(true)] out DiscordWebhook? webhook)
    {
        webhook = null;
        if (!Uri.TryCreate(raw?.Trim(), UriKind.Absolute, out var uri))
        {
            return false;
        }

        var isDiscordHttps = uri.Scheme == Uri.UriSchemeHttps
            && uri.IsDefaultPort
            && string.IsNullOrEmpty(uri.UserInfo)
            && DiscordHosts.Contains(uri.Host);
        if (!isDiscordHttps)
        {
            return false;
        }

        var match = PathPattern().Match(uri.AbsolutePath);
        if (!match.Success)
        {
            return false;
        }

        webhook = new DiscordWebhook(match.Groups["id"].Value, match.Groups["token"].Value);
        return true;
    }

    public bool HasSameToken(DiscordWebhook other)
        => Id == other.Id
           && CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(Token), Encoding.ASCII.GetBytes(other.Token));

    public override string ToString() => $"Discord webhook {Id}";

    [GeneratedRegex(@"^/api(/v[0-9]+)?/webhooks/(?<id>[0-9]{17,20})/(?<token>[A-Za-z0-9_-]{60,100})/?\z")]
    private static partial Regex PathPattern();

    [GeneratedRegex(@"^[0-9]{17,20}\z")]
    private static partial Regex IdPattern();

    [GeneratedRegex(@"^[A-Za-z0-9_-]{60,100}\z")]
    private static partial Regex TokenPattern();
}
