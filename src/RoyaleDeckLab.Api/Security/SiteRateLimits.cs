using System.Globalization;
using System.Threading.RateLimiting;

namespace RoyaleDeckLab.Api.Security;

public static class SiteRateLimits
{
    private const int GlobalPerMinute = 300;
    private const int ReminderSavesPerDay = 20;

    public static IServiceCollection AddSiteRateLimits(this IServiceCollection services) => services.AddRateLimiter(o =>
    {
        o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
        o.OnRejected = static async (ctx, ct) =>
        {
            var retryAfter = ctx.Lease.TryGetMetadata(MetadataName.RetryAfter, out var wait) ? wait : TimeSpan.FromMinutes(1);
            ctx.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(retryAfter.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
            ctx.HttpContext.Response.ContentType = "application/json";
            await ctx.HttpContext.Response.WriteAsync("""{"error":"Too many requests. Try again in a minute."}""", ct);
        };
        o.AddPolicy(RateLimitPolicies.Player, ctx => PerMinute(ctx, 30));
        o.AddPolicy(RateLimitPolicies.Clan, ctx => PerMinute(ctx, 20));
        o.AddPolicy(RateLimitPolicies.ClanSearch, ctx => PerMinute(ctx, 40));
        o.AddPolicy(RateLimitPolicies.Reminders, ctx => PerMinute(ctx, 10));
        o.AddPolicy(RateLimitPolicies.ReminderSave, ctx => PerDay(ctx, ReminderSavesPerDay));
        o.AddPolicy(RateLimitPolicies.ReminderTest, ctx => PerMinute(ctx, 3));
        o.AddPolicy(RateLimitPolicies.Admin, ctx => PerMinute(ctx, 5));
        o.AddPolicy(RateLimitPolicies.AdminStats, ctx => PerMinute(ctx, 30));
        o.AddPolicy(RateLimitPolicies.Stats, ctx => PerMinute(ctx, 60));
        o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => PerMinute(ctx, GlobalPerMinute));
    });

    private static RateLimitPartition<string> PerMinute(HttpContext context, int permits)
        => RateLimitPartition.GetFixedWindowLimiter(
            RateLimitKey.For(context.Connection.RemoteIpAddress),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromMinutes(1) });

    private static RateLimitPartition<string> PerDay(HttpContext context, int permits)
        => RateLimitPartition.GetFixedWindowLimiter(
            RateLimitKey.For(context.Connection.RemoteIpAddress),
            _ => new FixedWindowRateLimiterOptions { PermitLimit = permits, Window = TimeSpan.FromDays(1) });
}
