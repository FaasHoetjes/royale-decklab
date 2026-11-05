using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.Routing.Patterns;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class RequestRouteTests
{
    [Fact]
    public void Of_LogsTheRouteTemplateNotThePathWithTheTag()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/player/2QGG92L9/share-image";
        context.SetEndpoint(new RouteEndpoint(
            _ => Task.CompletedTask,
            RoutePatternFactory.Parse("api/player/{tag}/share-image"),
            0,
            EndpointMetadataCollection.Empty,
            null));

        Assert.Equal("api/player/{tag}/share-image", RequestRoute.Of(context));
    }

    [Fact]
    public void Of_WithoutAnEndpointLogsAPlaceholderNotThePath()
    {
        var context = new DefaultHttpContext();
        context.Request.Path = "/api/player/2QGG92L9/unknown";

        Assert.Equal("(no route)", RequestRoute.Of(context));
    }
}
