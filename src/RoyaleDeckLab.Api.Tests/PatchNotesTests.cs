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
    private const string August = "/en/games/clashroyale/blog/news/final-august-balance-changes-826";

    private readonly string _dbPath = Path.Combine(Path.GetTempPath(), $"patchnotes-{Guid.NewGuid():N}.db");

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        File.Delete(_dbPath);
    }

    private static long Ms(string iso) => DateTimeOffset.Parse(iso).ToUnixTimeMilliseconds();

    private static string Listing(params (string Title, string Path, string Published)[] posts)
        => Listing(posts.Select(p => (p.Title, p.Path, p.Published, "en")).ToArray());

    private static string Listing(params (string Title, string Path, string Published, string Locale)[] posts)
    {
        var data = new
        {
            props = new
            {
                pageProps = new
                {
                    news = posts.Select(p => new { title = p.Title, linkUrl = p.Path, publishDate = p.Published, locale = p.Locale }),
                },
            },
        };
        return $"""<html><body><script id="__NEXT_DATA__" type="application/json">{JsonSerializer.Serialize(data)}</script></body></html>""";
    }

    private static string Article(params string[] headings)
        => "<html><body><h1>Balance Changes</h1>"
           + string.Concat(headings.Select(h => $"<h2><strong>{h}</strong></h2><p>Some cards changed.</p>"))
           + "</body></html>";

    private static BlogPost Post(string published = "2026-10-06T06:15:39.011Z", string path = October)
        => new("October Balance Changes", path, DateTimeOffset.Parse(published));

    [Fact]
    public void The_listing_gives_the_English_Clash_Royale_posts_wherever_on_the_blog_they_are()
    {
        var html = Listing(
            ("October Balance Changes", October, "2026-10-06T06:15:39.011Z", "en"),
            ("August Balance Changes", August, "2026-08-04T08:00:00Z", "en"),
            ("Octobre", "/fr/games/clashroyale/blog/release-notes/octobre", "2026-10-06T06:15:39.011Z", "fr"),
            ("Brawl news", "/en/games/brawlstars/blog/news/x", "2026-10-06T06:15:39.011Z", "en"),
            ("Archive", "/en/games/clashroyale/blog/", "2026-10-06T06:15:39.011Z", "en"));

        Assert.Equal([October, August], PatchNotes.ParseListing(html).Select(p => p.Path));
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
    public void Each_heading_is_an_update_live_from_its_post_on_its_post_day_and_from_its_day_otherwise()
    {
        var notes = PatchNotes.ParseArticle(
            Article("Balance Update &ndash; October 19th", "Balance Update – October 6th", "BALANCE UPDATE - October 19th"), Post());

        Assert.Equal(
            [
                new PatchNote("balance-update#2026-10-19", new DateOnly(2026, 10, 19), Ms("2026-10-19T00:00:00Z")),
                new PatchNote("balance-update#2026-10-06", new DateOnly(2026, 10, 6), Ms("2026-10-06T06:15:39.011Z")),
            ],
            notes);
    }

    [Theory]
    [InlineData("2026-12-28T08:00:00Z", "January 4th", "2027-01-04")]
    [InlineData("2027-01-03T08:00:00Z", "December 30th", "2026-12-30")]
    [InlineData("2026-09-23T08:00:00Z", "September 8th", "2026-09-08")]
    public void A_heading_is_in_the_year_that_puts_it_nearest_its_post(string published, string heading, string expected)
        => Assert.Equal(
            DateOnly.Parse(expected),
            Assert.Single(PatchNotes.ParseArticle(Article($"Balance Update – {heading}"), Post(published))).Day);

    [Fact]
    public void A_post_without_update_headings_has_no_updates()
        => Assert.Empty(PatchNotes.ParseArticle(Article(), Post()));

    private sealed class Blog : HttpMessageHandler
    {
        public Dictionary<string, string> Pages { get; } = new();

        // Listing pages a test doesn't set are the back catalogue, too old to recheck.
        private static readonly string OldPosts = Listing(("Old news", "/en/games/clashroyale/blog/news/old", "2026-01-05T08:00:00Z"));

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var path = request.RequestUri!.AbsolutePath;
            var html = Pages.GetValueOrDefault(path) ?? (path.StartsWith("/en/games/clashroyale/blog/page/") ? OldPosts : null);
            return Task.FromResult(html is null
                ? new HttpResponseMessage(HttpStatusCode.NotFound)
                : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(html, Encoding.UTF8, "text/html") });
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
        public required Blog Blog { get; init; }
        public required PatchNotesWatchService Service { get; init; }
        public MetaCache Cache => Services.GetRequiredService<MetaCache>();

        public Task CheckAsync() => Service.CheckAsync(CancellationToken.None);

        public long StoredEpoch()
        {
            using var scope = Services.CreateScope();
            return scope.ServiceProvider.GetRequiredService<BattleRepository>().GetEpochStart();
        }

        public void Dispose() => Services.Dispose();
    }

    private static void ListOctober(Blog blog, params string[] headings)
    {
        blog.Pages[PatchNotes.ListingPage(1)] = Listing(("October Balance Changes", October, "2026-10-06T06:15:39.011Z"));
        blog.Pages[October] = Article(headings);
    }

    private async Task<Watch> WatchAsync(string now = "2026-10-15T12:00:00Z")
    {
        var blog = new Blog();
        var clock = new Clock(DateTimeOffset.Parse(now));
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
        using var watch = await WatchAsync();
        ListOctober(watch.Blog, "Balance Update – October 6th");

        await watch.CheckAsync();
        await watch.CheckAsync();

        Assert.Equal(0, watch.StoredEpoch());
    }

    [Fact]
    public async Task An_update_added_to_a_post_starts_a_patch_from_the_start_of_its_day_once_that_day_comes()
    {
        using var watch = await WatchAsync();
        ListOctober(watch.Blog, "Balance Update – October 6th");
        await watch.CheckAsync();

        ListOctober(watch.Blog, "Balance Update – October 19th", "Balance Update – October 6th");
        await watch.CheckAsync();
        Assert.Equal(0, watch.StoredEpoch());

        watch.Clock.Now = DateTimeOffset.Parse("2026-10-19T03:00:00Z");
        await watch.CheckAsync();
        Assert.Equal(Ms("2026-10-19T00:00:00Z"), watch.StoredEpoch());
    }

    [Fact]
    public async Task An_update_announced_before_the_watch_started_still_starts_its_patch()
    {
        using var watch = await WatchAsync("2026-10-17T12:00:00Z");
        ListOctober(watch.Blog, "Balance Update – October 19th", "Balance Update – October 6th");
        await watch.CheckAsync();

        watch.Clock.Now = DateTimeOffset.Parse("2026-10-19T03:00:00Z");
        await watch.CheckAsync();

        Assert.Equal(Ms("2026-10-19T00:00:00Z"), watch.StoredEpoch());
    }

    [Fact]
    public async Task An_update_found_late_is_dated_back_to_its_day()
    {
        using var watch = await WatchAsync("2026-10-12T12:00:00Z");
        watch.Blog.Pages[PatchNotes.ListingPage(1)] = Listing(("Other news", "/en/games/clashroyale/blog/news/x", "2026-10-10T08:00:00Z"));
        await watch.CheckAsync();

        watch.Clock.Now = DateTimeOffset.Parse("2026-10-25T12:00:00Z");
        watch.Blog.Pages[PatchNotes.ListingPage(1)] = Listing(
            ("September Balance Changes", "/en/games/clashroyale/blog/release-notes/september", "2026-10-23T08:00:00Z"));
        watch.Blog.Pages["/en/games/clashroyale/blog/release-notes/september"] = Article("Balance Update – October 16th");
        await watch.CheckAsync();

        Assert.Equal(Ms("2026-10-16T00:00:00Z"), watch.StoredEpoch());
    }

    [Fact]
    public async Task An_update_from_before_the_current_patch_doesnt_move_it()
    {
        using var watch = await WatchAsync("2026-10-25T12:00:00Z");
        ListOctober(watch.Blog, "Balance Update – October 6th");
        await watch.CheckAsync();
        await watch.Cache.SetEpochAsync(Ms("2026-10-20T00:00:00Z"));

        ListOctober(watch.Blog, "Balance Update – October 13th", "Balance Update – October 6th");
        await watch.CheckAsync();

        Assert.Equal(Ms("2026-10-20T00:00:00Z"), watch.StoredEpoch());
    }

    [Fact]
    public async Task A_balance_post_that_loads_without_its_headings_starts_nothing_and_isnt_marked_read()
    {
        using var watch = await WatchAsync();
        ListOctober(watch.Blog, "Balance Update – October 6th");
        watch.Blog.Pages[October] = "<html><body>Down for maintenance</body></html>";
        await watch.CheckAsync();
        await watch.CheckAsync();
        Assert.Equal(0, watch.StoredEpoch());

        ListOctober(watch.Blog, "Balance Update – October 6th");
        await watch.CheckAsync();
        watch.Clock.Now += TimeSpan.FromDays(10);
        await watch.CheckAsync();

        Assert.Equal(0, watch.StoredEpoch());
    }

    [Fact]
    public async Task A_post_off_the_first_listing_page_is_still_read()
    {
        using var watch = await WatchAsync("2026-10-25T12:00:00Z");
        watch.Blog.Pages[PatchNotes.ListingPage(1)] = Listing(("Other news", "/en/games/clashroyale/blog/news/x", "2026-10-24T08:00:00Z"));
        watch.Blog.Pages[PatchNotes.ListingPage(2)] = Listing(("October Balance Changes", October, "2026-10-06T06:15:39.011Z"));
        watch.Blog.Pages[October] = Article("Balance Update – October 6th");
        await watch.CheckAsync();

        watch.Blog.Pages[October] = Article("Balance Update – October 19th", "Balance Update – October 6th");
        await watch.CheckAsync();

        Assert.Equal(Ms("2026-10-19T00:00:00Z"), watch.StoredEpoch());
    }

    [Fact]
    public async Task A_blog_that_lists_nothing_doesnt_start_the_watch()
    {
        using var watch = await WatchAsync();
        watch.Blog.Pages[PatchNotes.ListingPage(1)] = "<html></html>";
        watch.Blog.Pages[October] = Article("Balance Update – October 6th");
        await watch.CheckAsync();

        ListOctober(watch.Blog, "Balance Update – October 6th");
        await watch.CheckAsync();
        watch.Clock.Now += TimeSpan.FromDays(10);
        await watch.CheckAsync();

        Assert.Equal(0, watch.StoredEpoch());
    }
}
