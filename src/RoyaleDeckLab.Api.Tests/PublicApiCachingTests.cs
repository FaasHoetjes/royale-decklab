using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.Extensions.DependencyInjection;
using RoyaleDeckLab.Api.Configuration;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PublicApiCachingTests
{
    [Fact]
    public async Task PublicResponsesAreShared_ButPathsEncodingsAndErrorsStaySeparate()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddSingleton<MetaCache>();
        services.AddPublicApiCaching();
        await using var provider = services.BuildServiceProvider();
        var calls = 0;
        var app = new ApplicationBuilder(provider);
        app.UseOutputCache();
        app.Run(async context =>
        {
            calls++;
            context.Response.StatusCode = context.Request.Path == "/error" ? 503 : 200;
            await context.Response.WriteAsync($"response-{calls}");
        });
        var pipeline = app.Build();
        async Task<string> Get(string path, string encoding = "br", string query = "", bool cacheable = true)
        {
            var context = new DefaultHttpContext { RequestServices = provider };
            context.Request.Method = "GET";
            context.Request.Scheme = "https";
            context.Request.Host = new HostString("example.test");
            context.Request.Path = path;
            context.Request.QueryString = new QueryString(query);
            context.Request.Headers.AcceptEncoding = encoding;
            context.SetEndpoint(new Endpoint(_ => Task.CompletedTask,
                cacheable ? new EndpointMetadataCollection(new OutputCacheAttribute { PolicyName = PublicApiCaching.Policy })
                    : new EndpointMetadataCollection(), "test"));
            using var body = new MemoryStream();
            context.Response.Body = body;
            await pipeline(context);
            body.Position = 0;
            return await new StreamReader(body).ReadToEndAsync();
        }
        var first = await Get("/api/cards");
        Assert.Equal(first, await Get("/api/cards", query: "?unused=1"));
        Assert.Equal(1, calls);
        Assert.NotEqual(first, await Get("/api/cards", encoding: "gzip"));
        Assert.NotEqual(first, await Get("/api/best-decks"));
        Assert.NotEqual(await Get("/error"), await Get("/error"));
        Assert.NotEqual(await Get("/api/player/test", cacheable: false), await Get("/api/player/test", cacheable: false));
    }
}
