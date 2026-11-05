using System.Net;

namespace RoyaleDeckLab.Api.Security;

/// <summary>
/// Production runs Cloudflare → Caddy → app. Caddy doesn't trust Cloudflare's forwarded headers, so it names the
/// Cloudflare server as the client, and every visitor sent through the same Cloudflare server shared one rate limit.
/// A request that arrives from one of Cloudflare's own ranges carries the visitor in CF-Connecting-IP, which
/// Cloudflare sets itself. From anywhere else the header is ignored, so going around Cloudflare can't fake an address.
/// </summary>
public static class CloudflareClientIp
{
    public const string HeaderName = "CF-Connecting-IP";

    // https://www.cloudflare.com/ips/, checked 2026-11-05.
    private static readonly IPNetwork[] Ranges =
    [
        .. new[]
        {
            "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
            "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
            "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
            "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
            "2a06:98c0::/29", "2c0f:f248::/32",
        }.Select(IPNetwork.Parse),
    ];

    public static bool IsCloudflare(IPAddress address)
    {
        var ip = address.IsIPv4MappedToIPv6 ? address.MapToIPv4() : address;
        return Ranges.Any(range => range.Contains(ip));
    }

    /// <summary>The visitor's address, or null when the request didn't come from Cloudflare or names no valid one.</summary>
    public static IPAddress? Resolve(IPAddress? remote, string? header)
    {
        if (remote is null || !IsCloudflare(remote))
        {
            return null;
        }
        return IPAddress.TryParse(header?.Trim(), out var visitor) ? visitor : null;
    }
}
