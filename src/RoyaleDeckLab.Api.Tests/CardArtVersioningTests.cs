using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Tests;

public sealed class CardArtVersioningTests : IDisposable
{
    private const string Kind = "cardevolutions";
    private const string Hash = "fAOToOi1pRy7svN2xQS6mDkhQw2pj9m_17FauaNqyl4";
    private const string ArtUrl = $"https://api-assets.clashroyale.com/{Kind}/300/{Hash}.png";

    private readonly string _directory = Path.Combine(Path.GetTempPath(), $"card-art-test-{Guid.NewGuid():N}");
    private readonly ArtCdn _cdn = new();
    private readonly ServiceProvider _provider;
    private readonly CardArtCache _art;

    public CardArtVersioningTests()
    {
        Directory.CreateDirectory(_directory);
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions { DbPath = Path.Combine(_directory, "meta.db") }));
        services.AddSingleton<IHostEnvironment>(new Environment(_directory));
        services.AddSingleton<IHttpClientFactory>(new Factory(_cdn));
        services.AddScoped(sp => new ClashRoyaleClient(sp.GetRequiredService<IHttpClientFactory>().CreateClient(nameof(ClashRoyaleClient))));
        services.AddSingleton<CardCatalog>();
        services.AddSingleton<CardArtCache>();
        _provider = services.BuildServiceProvider();
        _art = _provider.GetRequiredService<CardArtCache>();
    }

    public void Dispose()
    {
        _provider.Dispose();
        _cdn.Dispose();
        Directory.Delete(_directory, recursive: true);
    }

    [Fact]
    public void ArtNotYetOnDisk_KeepsItsCrUrl()
        => Assert.Equal(ArtUrl, _art.PublishedUrl(ArtUrl));

    [Fact]
    public async Task ReplacedArt_IsPublishedUnderANewVersion()
    {
        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);
        var placeholder = _art.PublishedUrl(ArtUrl);

        _cdn.Replace(SKColors.Purple, "\"real-art\"");
        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);
        var replaced = _art.PublishedUrl(ArtUrl);

        Assert.StartsWith($"/img/{Kind}/{Hash}.webp?v=", replaced);
        Assert.NotEqual(placeholder, replaced);
        Assert.True(_art.IsCurrentVersion(Kind, Hash, VersionIn(replaced)));
        Assert.False(_art.IsCurrentVersion(Kind, Hash, VersionIn(placeholder)));
        AssertCloseTo(SKColors.Purple, CenterPixel(await _art.GetAsync(Kind, Hash)));
    }

    private static void AssertCloseTo(SKColor expected, SKColor actual)
    {
        Assert.InRange(Math.Abs(actual.Red - expected.Red), 0, 12);
        Assert.InRange(Math.Abs(actual.Green - expected.Green), 0, 12);
        Assert.InRange(Math.Abs(actual.Blue - expected.Blue), 0, 12);
    }

    [Fact]
    public async Task UnchangedArt_IsNotDownloadedAgain()
    {
        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);
        var first = _art.PublishedUrl(ArtUrl);

        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);

        Assert.Equal(1, _cdn.FullDownloads);
        Assert.Equal(1, _cdn.NotModifiedAnswers);
        Assert.Equal(first, _art.PublishedUrl(ArtUrl));
    }

    [Fact]
    public async Task VersionIsRestoredFromDisk_AfterARestart()
    {
        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);
        var before = _art.PublishedUrl(ArtUrl);

        var restarted = new CardArtCache(
            _provider.GetRequiredService<IHttpClientFactory>(),
            _provider.GetRequiredService<CardCatalog>(),
            _provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<MetaOptions>>(),
            _provider.GetRequiredService<IHostEnvironment>(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<CardArtCache>.Instance);
        await restarted.RefreshAsync(Kind, Hash, CancellationToken.None);

        Assert.Equal(before, restarted.PublishedUrl(ArtUrl));
        Assert.Equal(1, _cdn.FullDownloads);
    }

    [Fact]
    public async Task ApiResponses_CarryTheVersionedUrl()
    {
        await _art.RefreshAsync(Kind, Hash, CancellationToken.None);
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new PublishedCardIconUrlsConverter(_art));

        var json = JsonSerializer.Serialize(new CardIconUrls(null, ArtUrl, null), options);

        Assert.Equal(
            $$"""{"medium":null,"evolutionMedium":"{{_art.PublishedUrl(ArtUrl)}}","heroMedium":null}""",
            json);
    }

    private static string VersionIn(string publishedUrl) => publishedUrl[(publishedUrl.IndexOf("?v=", StringComparison.Ordinal) + 3)..];

    private static SKColor CenterPixel(string? path)
    {
        Assert.NotNull(path);
        using var bitmap = SKBitmap.Decode(path);
        return bitmap.GetPixel(bitmap.Width / 2, bitmap.Height / 2);
    }

    private sealed class Factory(HttpMessageHandler cdn) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(cdn, disposeHandler: false) { BaseAddress = new Uri("https://api.test/") };
    }

    private sealed class Environment(string root) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "Test";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private sealed class ArtCdn : HttpMessageHandler
    {
        private SKColor _color = SKColors.Gray;
        private string _entityTag = "\"placeholder\"";

        public int FullDownloads { get; private set; }
        public int NotModifiedAnswers { get; private set; }

        public void Replace(SKColor color, string entityTag) => (_color, _entityTag) = (color, entityTag);

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var uri = request.RequestUri ?? throw new ArgumentException("Request without a URI", nameof(request));
            if (uri.Host != "api-assets.clashroyale.com")
            {
                var cards = new[] { new { id = 26000012, name = "Skeleton Army", maxLevel = 11, iconUrls = new { evolutionMedium = ArtUrl } } };
                var json = JsonSerializer.Serialize(new { items = cards });
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(json, Encoding.UTF8, "application/json") });
            }

            var isUnchanged = request.Headers.IfNoneMatch.Any(t => t.Tag == _entityTag);
            if (isUnchanged)
            {
                NotModifiedAnswers++;
                return Task.FromResult(new HttpResponseMessage(HttpStatusCode.NotModified));
            }

            FullDownloads++;
            using var surface = SKSurface.Create(new SKImageInfo(30, 45));
            surface.Canvas.Clear(_color);
            using var image = surface.Snapshot();
            using var png = image.Encode(SKEncodedImageFormat.Png, 100);
            var response = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(png.ToArray()) };
            response.Headers.ETag = new EntityTagHeaderValue(_entityTag);
            return Task.FromResult(response);
        }
    }
}
