using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>Balance updates are read off Supercell's blog, whose pages carry their posts as Next.js page data.</summary>
public sealed class PatchNotesTests : IDisposable
{
    private const string October = "/en/games/clashroyale/blog/release-notes/october-balance-changes-2026";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"patchnotes-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    private static string Listing(params (string Title, string Path, string Published, string Locale)[] posts)
    {
        var data = new
        {
            props = new
            {
                pageProps = new
                {
                    news = posts.Select(p => new
                    {
                        category = "Clash Royale", title = p.Title, linkUrl = p.Path, publishDate = p.Published, locale = p.Locale,
                    }),
                },
            },
        };
        return $"""<html><body><script id="__NEXT_DATA__" type="application/json">{JsonSerializer.Serialize(data)}</script></body></html>""";
    }

    private static string Article(params string[] headings)
        => "<html><body><h1>October Balance Changes</h1>"
           + string.Concat(headings.Select(h => $"<h2><strong>{h}</strong></h2><p>Some cards changed.</p>"))
           + "</body></html>";

    private static BlogPost Post(string published = "2026-10-06T06:15:39.011Z")
        => new("October Balance Changes", October, DateTimeOffset.Parse(published));

    [Fact]
    public void The_listing_gives_the_English_Clash_Royale_release_notes()
    {
        var posts = PatchNotes.ParseListing(Listing(
            ("October Balance Changes", October, "2026-10-06T06:15:39.011Z", "en"),
            ("Octobre", "/fr/games/clashroyale/blog/release-notes/octobre", "2026-10-06T06:15:39.011Z", "fr"),
            ("Brawl news", "/en/games/brawlstars/blog/news/x", "2026-10-06T06:15:39.011Z", "en")));

        var post = Assert.Single(posts);
        Assert.Equal(October, post.Path);
        Assert.Equal(new DateTimeOffset(2026, 10, 6, 6, 15, 39, 11, TimeSpan.Zero), post.PublishDate);
    }

    [Fact]
    public void A_page_without_page_data_lists_nothing()
        => Assert.Empty(PatchNotes.ParseListing("<html><body>Maintenance</body></html>"));

    [Theory]
    [InlineData("October Balance Changes", true)]
    [InlineData("Season 9 Balance Changes", true)]
    [InlineData("Merge Tactics: Season 11 Balance Changes", false)]
    [InlineData("New Season: King vs. King!", false)]
    public void Only_balance_posts_outside_Merge_Tactics_are_balance_updates(string title, bool expected)
        => Assert.Equal(expected, PatchNotes.IsBalanceUpdate(new BlogPost(title, October, DateTimeOffset.UnixEpoch)));

    [Fact]
    public void Each_balance_update_heading_is_its_own_update()
    {
        var notes = PatchNotes.ParseArticle(
            Article("Balance Update &ndash; October 19th", "Balance Update – October 6th", "Balance Update - October 19th"), Post());

        Assert.Equal(
            [
                new PatchNote("october-balance-changes-2026#2026-10-19", new DateOnly(2026, 10, 19)),
                new PatchNote("october-balance-changes-2026#2026-10-06", new DateOnly(2026, 10, 6)),
            ],
            notes);
    }

    [Fact]
    public void A_January_heading_in_a_December_post_is_next_year()
        => Assert.Equal(
            new DateOnly(2027, 1, 4),
            Assert.Single(PatchNotes.ParseArticle(Article("Balance Update – January 4th"), Post("2026-12-28T08:00:00Z"))).LiveOn);

    [Fact]
    public void A_post_without_update_headings_is_one_update_on_its_publish_day()
        => Assert.Equal(
            new PatchNote("october-balance-changes-2026#2026-10-06", new DateOnly(2026, 10, 6)),
            Assert.Single(PatchNotes.ParseArticle(Article(), Post())));

    private sealed class BlogHandler(Func<string> article) : HttpMessageHandler
    {
        public bool Broken { get; set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var html = Broken ? "<html></html>"
                : request.RequestUri!.AbsolutePath == SupercellBlogClient.ListingPath
                    ? Listing(("October Balance Changes", October, "2026-10-06T06:15:39.011Z", "en"))
                    : article();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(html, Encoding.UTF8, "text/html") });
        }
    }

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;

        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Watch : IDisposable
    {
        public required ServiceProvider Services { get; init; }
        public required Clock Clock { get; init; }
        public required BlogHandler Blog { get; init; }
        public required PatchNotesWatchService Service { get; init; }
        public MetaCache Cache => Services.GetRequiredService<MetaCache>();

        public void Dispose() => Services.Dispose();
    }

    private async Task<Watch> WatchAsync(Func<string> article)
    {
        var blog = new BlogHandler(article);
        var clock = new Clock(new DateTimeOffset(2026, 10, 15, 12, 0, 0, TimeSpan.Zero));
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(new MetaOptions()));
        services.AddDbContext<MetaDbContext>(o => o.UseSqlite($"Data Source={_dbPath}"));
        services.AddScoped<BattleRepository>();
        services.AddScoped<MetaBuilder>();
        services.AddSingleton(new ClashRoyaleClient(new HttpClient(blog) { BaseAddress = new Uri("https://cr.test/v1/") }));
        services.AddSingleton(new SupercellBlogClient(new HttpClient(blog) { BaseAddress = new Uri("https://blog.test/") }));
        services.AddSingleton<MetaCache>();
        var sp = services.BuildServiceProvider();
        using (var scope = sp.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
            db.Database.EnsureCreated();
            db.MetaState.Add(new MetaStateEntity { Id = 1 });
            await db.SaveChangesAsync();
        }
        var service = new PatchNotesWatchService(
            sp.GetRequiredService<IServiceScopeFactory>(), sp.GetRequiredService<MetaCache>(), clock,
            sp.GetRequiredService<Microsoft.Extensions.Options.IOptions<MetaOptions>>(), NullLogger<PatchNotesWatchService>.Instance);
        return new Watch { Services = sp, Clock = clock, Blog = blog, Service = service };
    }

    [Fact]
    public async Task The_updates_out_when_the_watch_starts_dont_start_a_patch()
    {
        using var watch = await WatchAsync(() => Article("Balance Update – October 6th"));

        await watch.Service.CheckAsync(CancellationToken.None);
        await watch.Service.CheckAsync(CancellationToken.None);

        Assert.Equal(0, watch.Cache.EpochStart);
    }

    [Fact]
    public async Task An_update_added_to_a_post_starts_a_patch_once_its_day_comes()
    {
        var headings = new List<string> { "Balance Update – October 6th" };
        using var watch = await WatchAsync(() => Article([.. headings]));
        await watch.Service.CheckAsync(CancellationToken.None);

        headings.Insert(0, "Balance Update – October 19th");
        await watch.Service.CheckAsync(CancellationToken.None);
        Assert.Equal(0, watch.Cache.EpochStart);

        watch.Clock.Now = new DateTimeOffset(2026, 10, 19, 0, 30, 0, TimeSpan.Zero);
        await watch.Service.CheckAsync(CancellationToken.None);
        Assert.Equal(watch.Clock.GetUtcNow().ToUnixTimeMilliseconds(), watch.Cache.EpochStart);

        watch.Clock.Now += TimeSpan.FromDays(2);
        await watch.Service.CheckAsync(CancellationToken.None);
        Assert.Equal(new DateTimeOffset(2026, 10, 19, 0, 30, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), watch.Cache.EpochStart);
    }

    [Fact]
    public async Task A_blog_it_cant_read_doesnt_start_the_watch()
    {
        using var watch = await WatchAsync(() => Article("Balance Update – October 6th"));
        watch.Blog.Broken = true;
        await watch.Service.CheckAsync(CancellationToken.None);

        watch.Blog.Broken = false;
        await watch.Service.CheckAsync(CancellationToken.None);
        watch.Clock.Now += TimeSpan.FromDays(1);
        await watch.Service.CheckAsync(CancellationToken.None);

        Assert.Equal(0, watch.Cache.EpochStart);
    }
}
