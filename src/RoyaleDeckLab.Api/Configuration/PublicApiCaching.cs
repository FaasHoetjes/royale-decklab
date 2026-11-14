using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Configuration;

public static class PublicApiCaching
{
    // Concurrent misses share the first request's execution, so actions under this policy must not
    // observe RequestAborted: one client leaving would fail every request waiting on it with a 500.
    public const string Policy = "public-json";

    public static IServiceCollection AddPublicApiCaching(this IServiceCollection services)
        => services.AddOutputCache(o => o.AddPolicy(Policy, policy => policy
            .Expire(TimeSpan.FromMinutes(5))
            .SetVaryByQuery(Array.Empty<string>())
            .SetVaryByHeader("Accept-Encoding")
            .VaryByValue(context => new KeyValuePair<string, string>("meta-version",
                $"{context.RequestServices.GetRequiredService<MetaCache>().Version}." +
                $"{context.RequestServices.GetRequiredService<BalanceUpdateStore>().Version}"))));
}
