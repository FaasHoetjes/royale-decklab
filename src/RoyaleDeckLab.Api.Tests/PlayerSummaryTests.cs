using System.Net;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Controllers;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PlayerSummaryTests
{
    [Fact]
    public async Task ReturnsClanSummaryWithoutCardsOrDeckServices_AndReusesProfileCache()
    {
        using var api = new StubApi();
        var controller = Controller(api);
        var first = await controller.Summary("#2QGG92L9", CancellationToken.None);
        var second = await controller.Summary("#2QGG92L9", CancellationToken.None);
        Assert.Equal(new PlayerSummary("#2QGG92L9", "Player", "#L9VRJ", "Example", 16000067), first.Value);
        Assert.Equal(first.Value, second.Value);
        Assert.Equal(1, api.Calls);
    }

    [Fact]
    public async Task PlayerWithoutClan_HasNullClanFields()
    {
        using var api = new StubApi { Body = """{"tag":"#2QGG92L9","name":"Player"}""" };
        var result = await Controller(api).Summary("#2QGG92L9", CancellationToken.None);
        Assert.Equal(new PlayerSummary("#2QGG92L9", "Player", null, null, null), result.Value);
    }

    [Fact]
    public async Task InvalidTag_DoesNotCallUpstream()
    {
        using var api = new StubApi();
        var result = await Controller(api).Summary("invalid!", CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(0, api.Calls);
    }

    [Fact]
    public async Task MissingPlayer_ReturnsNotFound()
    {
        using var api = new StubApi { Status = HttpStatusCode.NotFound };
        var result = await Controller(api).Summary("#2QGG92L9", CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    private static PlayerController Controller(StubApi api) => new(
        new PlayerProfileCache(new StubFactory(api), TimeProvider.System), null!, null!, null!, null!, NullLogger<PlayerController>.Instance);

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    private sealed class StubApi : HttpMessageHandler
    {
        public int Calls;
        public HttpStatusCode Status = HttpStatusCode.OK;
        public string Body = """{"tag":"#2QGG92L9","name":"Player","clan":{"tag":"#L9VRJ","name":"Example","badgeId":16000067}}""";
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Interlocked.Increment(ref Calls);
            return Task.FromResult(new HttpResponseMessage(Status) { Content = new StringContent(Body, Encoding.UTF8, "application/json") });
        }
    }
}
