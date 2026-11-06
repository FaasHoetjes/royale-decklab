using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ShareImageServiceTests
{
    [Fact]
    public async Task ColdArtLoadsInParallel_AndStaysInSharedCardOrder()
    {
        var directory = Path.Combine(Path.GetTempPath(), $"share-image-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(directory);
        using var api = new ArtApi();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions { DbPath = Path.Combine(directory, "meta.db") }));
        services.AddSingleton<IHostEnvironment>(new Environment(directory));
        services.AddSingleton<IHttpClientFactory>(new Factory(api));
        services.AddScoped(sp => new ClashRoyaleClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(ClashRoyaleClient))));
        services.AddSingleton<CardCatalog>();
        services.AddSingleton<PlayerProfileCache>();
        services.AddSingleton<MetaCache>();
        services.AddSingleton<DeckAnalyzer>();
        services.AddSingleton<CardArtCache>();
        services.AddSingleton<ShareImageService>();
        using var provider = services.BuildServiceProvider();
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var rendering = provider.GetRequiredService<ShareImageService>().GetAsync("2QGG92L9", "0001020304050607", timeout.Token);
            try
            {
                // A sequential loader cannot reach all eight while the first response is held.
                await api.AllStarted.Task.WaitAsync(timeout.Token);
                Assert.False(rendering.IsCompleted);
            }
            finally
            {
                for (var i = 7; i >= 0; i--) api.Release[i].TrySetResult();
            }
            var jpeg = await rendering.WaitAsync(timeout.Token);
            Assert.NotNull(jpeg);
            using var bitmap = SKBitmap.Decode(jpeg);
            Assert.Equal((1200, 630), (bitmap.Width, bitmap.Height));
            for (var i = 0; i < 8; i++)
            {
                var actual = bitmap.GetPixel(500 + i * 88, 167);
                var expected = ArtApi.Colors[i];
                Assert.InRange(Math.Abs(actual.Red - expected.Red), 0, 12);
                Assert.InRange(Math.Abs(actual.Green - expected.Green), 0, 12);
                Assert.InRange(Math.Abs(actual.Blue - expected.Blue), 0, 12);
            }
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }

    private sealed class Factory(HttpMessageHandler api) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(api, disposeHandler: false) { BaseAddress = new Uri("https://api.test/") };
    }

    private sealed class Environment(string root) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class ArtApi : HttpMessageHandler
    {
        public static readonly SKColor[] Colors = [SKColors.Red, SKColors.Lime, SKColors.Blue, SKColors.Yellow,
            SKColors.Cyan, SKColors.Magenta, SKColors.Orange, SKColors.White];
        public TaskCompletionSource AllStarted { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource[] Release { get; } = Enumerable.Range(0, 8)
            .Select(_ => new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously)).ToArray();
        private int _started;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (request.RequestUri!.Host == "api-assets.clashroyale.com")
            {
                var i = Path.GetFileNameWithoutExtension(request.RequestUri.AbsolutePath)[^1] - '0';
                if (Interlocked.Increment(ref _started) == 8) AllStarted.TrySetResult();
                await Release[i].Task.WaitAsync(ct);
                using var surface = SKSurface.Create(new SKImageInfo(30, 45));
                surface.Canvas.Clear(Colors[i]);
                using var image = surface.Snapshot();
                using var png = image.Encode(SKEncodedImageFormat.Png, 100);
                return new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(png.ToArray()) };
            }
            var cards = Enumerable.Range(0, 8).Select(i => new
            {
                id = 26000000 + i, name = $"Card{i}", level = 16, maxLevel = 16, elixirCost = 3,
                iconUrls = new { medium = $"https://api-assets.clashroyale.com/cards/300/abcdefghijklmnop{i}.png" },
            }).ToArray();
            var json = request.RequestUri.AbsolutePath == "/cards"
                ? JsonSerializer.Serialize(new { items = cards })
                : JsonSerializer.Serialize(new { tag = "#2QGG92L9", name = "Player", cards });
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") };
        }
    }
}
