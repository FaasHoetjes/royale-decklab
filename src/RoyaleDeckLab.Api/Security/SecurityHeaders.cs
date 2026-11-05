namespace RoyaleDeckLab.Api.Security;

public static class SecurityHeaders
{
    private const string ContentSecurityPolicy =
        "default-src 'self'; " +
        "script-src 'self' https://static.cloudflareinsights.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https://api-assets.clashroyale.com; " +
        "connect-src 'self' https://cloudflareinsights.com; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'";

    public static void UseSecurityHeaders(this WebApplication app) => app.Use(async (context, next) =>
    {
        var headers = context.Response.Headers;
        headers.ContentSecurityPolicy = ContentSecurityPolicy;
        headers.StrictTransportSecurity = "max-age=31536000";
        headers.XContentTypeOptions = "nosniff";
        headers.XFrameOptions = "DENY";
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
        await next();
    });
}
