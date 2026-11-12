using System.Net;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>
/// [ResponseCache] marks a response public for five minutes before the action runs, so a failure has to take that
/// back, or browsers keep showing the error after the server has recovered.
/// </summary>
public sealed class ErrorCachingTests : IDisposable
{
    private const string FilterCaching = "public,max-age=300";

    private readonly HttpClient _http = new(new FailingApi()) { BaseAddress = new Uri("https://cr.test/v1/") };
    private readonly ServiceProvider _services;
    private readonly CardCatalog _catalog;
    private readonly MetaCache _meta;

    public ErrorCachingTests()
    {
        _services = new ServiceCollection()
            .AddSingleton(new ClashRoyaleClient(_http))
            .BuildServiceProvider();
        var scopes = _services.GetRequiredService<IServiceScopeFactory>();
        _catalog = new CardCatalog(scopes, TimeProvider.System);
        _meta = new MetaCache(scopes, Microsoft.Extensions.Options.Options.Create(new MetaOptions()), NullLogger<MetaCache>.Instance);
    }

    public void Dispose()
    {
        _services.Dispose();
        _http.Dispose();
    }

    private sealed class FailingApi : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
            => Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError));
    }

    private static T WithFilterCaching<T>(T controller) where T : ControllerBase
    {
        var context = new DefaultHttpContext();
        context.Response.Headers.CacheControl = FilterCaching;
        controller.ControllerContext = new ControllerContext { HttpContext = context };
        return controller;
    }

    [Fact]
    public async Task A_failed_card_catalog_isnt_cached()
    {
        var controller = WithFilterCaching(new CardsController(_catalog, _meta, new BestDecksBuilder(), NullLogger<CardsController>.Instance));

        var result = Assert.IsType<ObjectResult>(await controller.Get(CancellationToken.None));

        Assert.Equal(StatusCodes.Status500InternalServerError, result.StatusCode);
        Assert.Equal("no-store", controller.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Failed_card_decks_arent_cached()
    {
        var controller = WithFilterCaching(new CardsController(_catalog, _meta, new BestDecksBuilder(), NullLogger<CardsController>.Instance));

        var result = Assert.IsType<ObjectResult>(await controller.Decks(26_000_000, CancellationToken.None));

        Assert.Equal(StatusCodes.Status500InternalServerError, result.StatusCode);
        Assert.Equal("no-store", controller.Response.Headers.CacheControl.ToString());
    }

    [Fact]
    public async Task Failed_best_decks_arent_cached()
    {
        var controller = WithFilterCaching(new BestDecksController(_meta, _catalog, new BestDecksBuilder(), NullLogger<BestDecksController>.Instance));

        var result = Assert.IsType<ObjectResult>(await controller.Get(CancellationToken.None));

        Assert.Equal(StatusCodes.Status500InternalServerError, result.StatusCode);
        Assert.Equal("no-store", controller.Response.Headers.CacheControl.ToString());
    }
}
