using System.Net;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CloudflareClientIpTests
{
    [Theory]
    [InlineData("172.70.1.2", "84.1.2.3", "84.1.2.3")]
    [InlineData("162.159.200.1", " 2a02:a420::1 ", "2a02:a420::1")]
    [InlineData("::ffff:104.23.0.9", "84.1.2.3", "84.1.2.3")]
    [InlineData("2606:4700:10::ac43:1", "84.1.2.3", "84.1.2.3")]
    public void Resolve_TakesTheVisitorFromCloudflare(string remote, string header, string expected)
        => Assert.Equal(IPAddress.Parse(expected), CloudflareClientIp.Resolve(IPAddress.Parse(remote), header));

    [Theory]
    [InlineData("84.1.2.3", "9.9.9.9")]
    [InlineData("172.18.0.3", "9.9.9.9")]
    [InlineData("2a02:a420::1", "9.9.9.9")]
    public void Resolve_IgnoresTheHeaderFromAnyoneElse(string remote, string header)
        => Assert.Null(CloudflareClientIp.Resolve(IPAddress.Parse(remote), header));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not an ip")]
    [InlineData("84.1.2.3,9.9.9.9")]
    public void Resolve_IgnoresAMissingOrBadHeader(string? header)
        => Assert.Null(CloudflareClientIp.Resolve(IPAddress.Parse("172.70.1.2"), header));

    [Fact]
    public void Resolve_NeedsARemoteAddress()
        => Assert.Null(CloudflareClientIp.Resolve(null, "84.1.2.3"));
}
