using System.Net;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Tests;

public sealed class RateLimitKeyTests
{
    [Theory]
    [InlineData("84.1.2.3", "84.1.2.3")]
    [InlineData("::ffff:84.1.2.3", "84.1.2.3")]
    [InlineData("2001:db8:1:2::1", "2001:db8:1:2::/64")]
    [InlineData("2001:db8:1:2:ffff:ffff:ffff:ffff", "2001:db8:1:2::/64")]
    [InlineData("fe80::1%3", "fe80::/64")]
    public void For_CollapsesIPv6To64AndKeepsIPv4(string address, string expected)
    {
        Assert.Equal(expected, RateLimitKey.For(IPAddress.Parse(address)));
    }

    [Fact]
    public void For_GivesOneKeyToEveryAddressInAPrefix()
    {
        Assert.Equal(
            RateLimitKey.For(IPAddress.Parse("2001:db8:1:2::1")),
            RateLimitKey.For(IPAddress.Parse("2001:db8:1:2:1234:5678:9abc:def0")));
    }

    [Fact]
    public void For_KeepsNeighbouringPrefixesApart()
    {
        Assert.NotEqual(
            RateLimitKey.For(IPAddress.Parse("2001:db8:1:2::1")),
            RateLimitKey.For(IPAddress.Parse("2001:db8:1:3::1")));
    }

    [Fact]
    public void For_NoAddressIsItsOwnKey()
    {
        Assert.Equal(RateLimitKey.Unknown, RateLimitKey.For(null));
    }
}
