using System.Net;
using System.Net.Sockets;

namespace RoyaleDeckLab.Api.Security;

/// <summary>
/// The address a rate limit counts against. An IPv6 host gets a whole /64 to itself, since its provider hands out
/// that many addresses, so a client rotating through them can't escape the limit.
/// </summary>
public static class RateLimitKey
{
    public const string Unknown = "unknown";

    public static string For(IPAddress? address)
    {
        if (address is null)
        {
            return Unknown;
        }
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }
        if (address.AddressFamily != AddressFamily.InterNetworkV6)
        {
            return address.ToString();
        }

        var bytes = address.GetAddressBytes();
        Array.Clear(bytes, 8, 8);
        return new IPAddress(bytes) + "/64";
    }
}
