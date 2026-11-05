using Microsoft.AspNetCore.Routing;

namespace RoyaleDeckLab.Api.Services;

/// <summary>The route a request matched, for the request log. The raw path is never logged, since a player's tag is in it.</summary>
public static class RequestRoute
{
    public static string Of(HttpContext context)
        => (context.GetEndpoint() as RouteEndpoint)?.RoutePattern.RawText ?? "(no route)";
}
