using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Security;

public static class ProxyHeaders
{
    /// <summary>
    /// Behind Caddy (TRUST_PROXY_HEADERS=true), takes the client address from the forwarded headers of the proxies in
    /// TRUSTED_PROXY_IPS, then from Cloudflare's own header when the request came through Cloudflare.
    /// </summary>
    public static void UseProxyHeaders(this WebApplication app)
    {
        if (Environment.GetEnvironmentVariable("TRUST_PROXY_HEADERS") != "true")
        {
            return;
        }

        var forwarded = new ForwardedHeadersOptions
        {
            ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
            ForwardLimit = 2,
        };
        forwarded.KnownIPNetworks.Clear();
        forwarded.KnownProxies.Clear();

        var trustedProxies = Environment.GetEnvironmentVariable("TRUSTED_PROXY_IPS");
        if (!string.IsNullOrWhiteSpace(trustedProxies))
        {
            foreach (var entry in trustedProxies.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries))
            {
                if (entry.Contains('/'))
                {
                    forwarded.KnownIPNetworks.Add(System.Net.IPNetwork.Parse(entry));
                }
                else
                {
                    forwarded.KnownProxies.Add(IPAddress.Parse(entry));
                }
            }
        }
        app.UseForwardedHeaders(forwarded);
        app.Use((context, next) =>
        {
            var visitor = CloudflareClientIp.Resolve(
                context.Connection.RemoteIpAddress,
                context.Request.Headers[CloudflareClientIp.HeaderName].ToString());
            if (visitor is not null)
            {
                context.Connection.RemoteIpAddress = visitor;
                context.Items[StatsRecorder.ViaCloudflare] = true;
            }
            return next(context);
        });
    }
}
