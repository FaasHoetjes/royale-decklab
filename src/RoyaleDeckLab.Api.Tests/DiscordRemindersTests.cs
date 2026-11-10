using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services.Reminders;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>Setting up a clan's reminder and the job that posts it, against a stubbed CR API and Discord.</summary>
public sealed class DiscordRemindersTests : IDisposable
{
    private const string Url = "https://discord.com/api/webhooks/" + DiscordWebhookTests.Id + "/" + DiscordWebhookTests.Token;
    private const string Guild = "1100000000000000001";

    private const string ClanJson = """
        {"tag":"#L9VRJ","name":"Example","memberList":[
          {"tag":"#AAA","name":"Anna","role":"leader","lastSeen":"20261106T154147.000Z"},
          {"tag":"#BBB","name":"Bob","role":"member","lastSeen":"20261105T230420.000Z"}]}
        """;

    private const string LogJson = """
        {"items":[{"seasonId":137,"sectionIndex":3,"createdDate":"20261102T093900.000Z","standings":[
          {"rank":2,"clan":{"tag":"#L9VRJ","fame":30000,"participants":[{"tag":"#AAA","fame":3000,"decksUsed":16}]}}]}]}
        """;

    private static readonly DateTimeOffset Reset = new(2026, 11, 9, 9, 39, 0, TimeSpan.Zero);
    private static readonly ReminderSettings TwoHours = new(2, ReminderMessageStyle.Names, ReminderPing.Nobody, false);

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"reminders-{Guid.NewGuid():N}.db");
    private readonly Stub _http = new();
    private readonly Clock _clock = new(Reset.AddHours(-1));
    private readonly WebhookTokenCipher _cipher = ReminderStoreTests.Cipher(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
    private readonly ReminderStore _store;
    private readonly DiscordReminderSetup _setup;
    private readonly ReminderService _service;
    private readonly ClanTag _clan = Clan("L9VRJ");

    public DiscordRemindersTests()
    {
        _store = new ReminderStore(_path, _cipher, NullLogger<ReminderStore>.Instance);
        _setup = Setup(_cipher);
        _service = Service();
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            File.Delete(file);
        }
    }

    private static ClanTag Clan(string tag)
    {
        Assert.True(ClanTag.TryParse(tag, out var clan));
        return clan;
    }

    private static string UrlOf(int i) => $"https://discord.com/api/webhooks/13012345678901234{i:00}/{DiscordWebhookTests.Token}";

    /// <summary>Each caller gets its own one-minute cache, so a test can change the CR API's answers between calls.</summary>
    private ClanWarCache ClanWars()
    {
        var factory = new StubFactory(_http);
        return new ClanWarCache(factory, new MemoryCache(new MemoryCacheOptions()), _clock, new ClanHistoryCache(factory, _clock));
    }

    private DiscordReminderSetup Setup(WebhookTokenCipher cipher)
        => new(_store, cipher, ClanWars(), new StubFactory(_http), NullLogger<DiscordReminderSetup>.Instance);

    private ReminderService Service()
        => new(_store, _cipher, ClanWars(), new StubFactory(_http), _clock, NullLogger<ReminderService>.Instance);

    private sealed class Clock(DateTimeOffset now) : TimeProvider
    {
        public DateTimeOffset Now { get; set; } = now;
        public override DateTimeOffset GetUtcNow() => Now;
    }

    private sealed class Stub : HttpMessageHandler
    {
        public string Period { get; set; } = "warDay";
        public int BobsDecksToday { get; set; }
        public string BrokenClan { get; set; } = "none";
        public HttpStatusCode ClashRoyaleStatus { get; set; } = HttpStatusCode.OK;
        public HttpStatusCode DiscordStatus { get; set; } = HttpStatusCode.NoContent;
        public HttpStatusCode DiscordLookupStatus { get; set; } = HttpStatusCode.OK;
        public string? GuildId { get; set; } = Guild;
        public List<string> DiscordPosts { get; } = [];

        /// <summary>Runs once, while Discord is answering the next post.</summary>
        public Func<Task>? WhilePosting { get; set; }

        /// <summary>Runs once, while Discord is answering the next lookup.</summary>
        public Func<Task>? WhileLookingUp { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var uri = request.RequestUri ?? throw new InvalidOperationException("No request URI");
            if (uri.Host == "discord.com")
            {
                return request.Method == HttpMethod.Get ? await LookUpAsync() : await PostAsync(request, ct);
            }
            if (ClashRoyaleStatus != HttpStatusCode.OK)
            {
                return Json(ClashRoyaleStatus, "{}");
            }

            var tag = Regex.Match(uri.AbsoluteUri, "%23([A-Za-z0-9]+)").Groups[1].Value.ToUpperInvariant();
            var path = uri.AbsolutePath;
            var body = path switch
            {
                _ when path.EndsWith("/currentriverrace", StringComparison.Ordinal) => RaceJson(tag == BrokenClan ? "someNewPeriod" : Period),
                _ when path.EndsWith("/riverracelog", StringComparison.Ordinal) => LogJson,
                _ => ClanJson,
            };
            return Json(HttpStatusCode.OK, body.Replace("#L9VRJ", "#" + tag));
        }

        private async Task<HttpResponseMessage> LookUpAsync()
        {
            var whileLookingUp = WhileLookingUp;
            WhileLookingUp = null;
            if (whileLookingUp is not null)
            {
                await whileLookingUp();
            }
            if (DiscordLookupStatus != HttpStatusCode.OK)
            {
                return Json(DiscordLookupStatus, "{}");
            }
            var guild = GuildId is null ? "" : $",\"guild_id\":\"{GuildId}\"";
            return Json(HttpStatusCode.OK, $$"""{"name":"War reminders"{{guild}}}""");
        }

        private async Task<HttpResponseMessage> PostAsync(HttpRequestMessage request, CancellationToken ct)
        {
            DiscordPosts.Add(await (request.Content ?? throw new InvalidOperationException("No body")).ReadAsStringAsync(ct));
            var whilePosting = WhilePosting;
            WhilePosting = null;
            if (whilePosting is not null)
            {
                await whilePosting();
            }
            return new HttpResponseMessage(DiscordStatus);
        }

        private string RaceJson(string period) => $$"""
            {"clan":{"tag":"#L9VRJ","participants":[{"tag":"#AAA","decksUsed":4,"decksUsedToday":4},{"tag":"#BBB","decksUsed":{{BobsDecksToday}},"decksUsedToday":{{BobsDecksToday}}}]},
             "clans":[{"tag":"#L9VRJ","name":"Example","fame":3000,"periodPoints":900}],
             "periodIndex":{{(period == "training" ? 0 : 4)}},"periodType":"{{period}}"}
            """;

        private static HttpResponseMessage Json(HttpStatusCode status, string body)
            => new(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private sealed class StubFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
            => new(handler, disposeHandler: false) { BaseAddress = new Uri("https://cr.test/v1/") };
    }

    [Fact]
    public async Task Saves_ThenPostsOnceBeforeTheReset()
    {
        var saved = await _setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Saved("War reminders"), saved);
        await _service.PostDueAsync(default);
        await _service.PostDueAsync(default);

        var post = Assert.Single(_http.DiscordPosts);
        Assert.Contains("Bob", post);
        Assert.Contains("\"allowed_mentions\":{\"parse\":[]}", post);
        Assert.DoesNotContain("Anna", post);
    }

    [Fact]
    public async Task WaitsUntilTheChosenTime()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _clock.Now = Reset.AddHours(-3);

        await _service.PostDueAsync(default);

        Assert.Empty(_http.DiscordPosts);
    }

    [Fact]
    public async Task PostsNothing_OnTrainingDays()
    {
        _http.Period = "training";
        await _setup.SaveAsync(_clan, Url, TwoHours, default);

        await _service.PostDueAsync(default);

        Assert.Empty(_http.DiscordPosts);
    }

    [Fact]
    public async Task StaysQuiet_WhenEveryoneAlreadyPlayed()
    {
        _http.BobsDecksToday = 4;
        await _setup.SaveAsync(_clan, Url, TwoHours, default);

        await _service.PostDueAsync(default);

        Assert.Empty(_http.DiscordPosts);
    }

    [Fact]
    public async Task Celebrates_WhenEveryoneAlreadyPlayed_IfAskedTo()
    {
        _http.BobsDecksToday = 4;
        await _setup.SaveAsync(_clan, Url, TwoHours with { PostWhenAllDone = true }, default);

        await _service.PostDueAsync(default);

        Assert.Contains("every deck played", Assert.Single(_http.DiscordPosts));
    }

    [Fact]
    public async Task TriesAgainNextMinute_WhenDiscordRefusedThePost()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = HttpStatusCode.TooManyRequests;
        await _service.PostDueAsync(default);

        _http.DiscordStatus = HttpStatusCode.NoContent;
        await _service.PostDueAsync(default);
        await _service.PostDueAsync(default);

        Assert.Equal(2, _http.DiscordPosts.Count);
    }

    [Fact]
    public async Task GivesUpOnTheDay_WhenDiscordKeepsRefusing()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = HttpStatusCode.TooManyRequests;

        for (var tick = 0; tick < DiscordReminder.MaxFailuresPerDay + 2; tick++)
        {
            await _service.PostDueAsync(default);
        }

        Assert.Equal(DiscordReminder.MaxFailuresPerDay, _http.DiscordPosts.Count);
    }

    [Fact]
    public async Task PostsOnce_WhenTheAnswerIsLostAfterDiscordTookIt()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = HttpStatusCode.InternalServerError;
        await _service.PostDueAsync(default);

        _http.DiscordStatus = HttpStatusCode.NoContent;
        await _service.PostDueAsync(default);

        Assert.Single(_http.DiscordPosts);
    }

    [Fact]
    public async Task PostsOnce_WhenTheSiteStopsMidPost()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        using var stopping = new CancellationTokenSource();
        _http.WhilePosting = async () =>
        {
            await stopping.CancelAsync();
            stopping.Token.ThrowIfCancellationRequested();
        };
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => _service.PostDueAsync(stopping.Token));

        await Service().PostDueAsync(default);

        Assert.Single(_http.DiscordPosts);
    }

    [Theory]
    [InlineData(HttpStatusCode.NoContent)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task TurningOffMidPost_StaysOff(HttpStatusCode discordAnswer)
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = discordAnswer;
        _http.WhilePosting = () =>
        {
            Assert.Null(_setup.Delete(_clan, Url));
            return Task.CompletedTask;
        };

        await _service.PostDueAsync(default);

        Assert.Empty(_store.All());
    }

    [Fact]
    public async Task ChangingSettingsMidPost_DoesntPostAgain()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.WhileLookingUp = () => _service.PostDueAsync(default);

        await _setup.SaveAsync(_clan, Url, TwoHours with { Style = ReminderMessageStyle.Full }, default);
        await _service.PostDueAsync(default);

        Assert.Single(_http.DiscordPosts);
        Assert.Equal(ReminderMessageStyle.Full, Assert.Single(_store.All()).Settings.Style);
    }

    [Fact]
    public async Task OneBrokenClan_DoesntHoldUpTheOthers()
    {
        await _setup.SaveAsync(Clan("PPPPP"), UrlOf(1), TwoHours, default);
        await _setup.SaveAsync(_clan, UrlOf(2), TwoHours, default);
        _http.BrokenClan = "PPPPP";

        await Service().PostDueAsync(default);

        Assert.Single(_http.DiscordPosts);
    }

    [Fact]
    public async Task RemovesTheReminder_WhenDiscordDeletedTheWebhook()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = HttpStatusCode.NotFound;
        _http.DiscordLookupStatus = HttpStatusCode.NotFound;

        await _service.PostDueAsync(default);

        Assert.Empty(_store.All());
    }

    [Fact]
    public async Task KeepsTheReminder_WhenDiscordStillKnowsTheWebhook()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        _http.DiscordStatus = HttpStatusCode.NotFound;
        await _service.PostDueAsync(default);

        _http.DiscordStatus = HttpStatusCode.NoContent;
        await _service.PostDueAsync(default);

        Assert.Single(_store.All());
        Assert.Equal(2, _http.DiscordPosts.Count);
    }

    [Fact]
    public async Task RefusesAWebhookDiscordDoesntKnow()
    {
        _http.DiscordLookupStatus = HttpStatusCode.NotFound;

        var result = await _setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.WebhookNotFound), result);
        Assert.Empty(_store.All());
    }

    [Fact]
    public async Task RefusesAWebhookWithoutADiscordServer()
    {
        _http.GuildId = null;

        var result = await _setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.InvalidWebhook), result);
    }

    [Theory]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.InternalServerError)]
    public async Task SaysDiscordFailed_WhenTheLookupFails(HttpStatusCode discordAnswer)
    {
        _http.DiscordLookupStatus = discordAnswer;

        var result = await _setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.DiscordFailed), result);
    }

    [Fact]
    public async Task SaysClashRoyaleFailed_WhenTheClanCantBeLookedUp()
    {
        _http.ClashRoyaleStatus = HttpStatusCode.ServiceUnavailable;

        var result = await _setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.ClashRoyaleFailed), result);
    }

    [Fact]
    public async Task LimitsRemindersPerDiscordServer_NotPerClan()
    {
        for (var i = 0; i < DiscordReminderSetup.MaxPerServer; i++)
        {
            Assert.IsType<ReminderSetupResult.Saved>(await _setup.SaveAsync(_clan, UrlOf(i), TwoHours, default));
        }

        var full = await _setup.SaveAsync(_clan, UrlOf(50), TwoHours, default);
        var changingOne = await _setup.SaveAsync(_clan, UrlOf(0), TwoHours with { HoursBeforeReset = 1 }, default);
        _http.GuildId = "1100000000000000002";
        var otherServer = await _setup.SaveAsync(_clan, UrlOf(51), TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.TooManyForServer), full);
        Assert.IsType<ReminderSetupResult.Saved>(changingOne);
        Assert.IsType<ReminderSetupResult.Saved>(otherServer);
        Assert.Equal(DiscordReminderSetup.MaxPerServer + 1, _store.ForClan(_clan).Count);
    }

    [Fact]
    public async Task KeepsItsDiscordCallsWithinABudget()
    {
        for (var i = 0; i < DiscordReminderSetup.DiscordCallsPerMinute; i++)
        {
            Assert.Null(await _setup.TestAsync(_clan, Url, TwoHours, default));
        }

        Assert.Equal(ReminderProblem.Busy, await _setup.TestAsync(_clan, Url, TwoHours, default));
    }

    [Fact]
    public async Task OnlyTheWebhooksOwnUrl_TurnsItOff()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);
        var wrongToken = Url.Replace(DiscordWebhookTests.Token, DiscordWebhookTests.Token.Replace('k', 'q'));

        Assert.Equal(ReminderProblem.NotRegistered, _setup.Delete(_clan, wrongToken));
        Assert.Single(_store.All());
        Assert.Null(_setup.Delete(_clan, Url));
        Assert.Empty(_store.All());
    }

    [Fact]
    public async Task ShowsTheClansSettings_ButNoWebhook()
    {
        await _setup.SaveAsync(_clan, Url, TwoHours, default);

        var reminders = _setup.For(_clan);

        Assert.True(reminders.IsAvailable);
        Assert.Equal([TwoHours], reminders.Reminders);
    }

    [Fact]
    public async Task IsOff_WithoutAnEncryptionKey()
    {
        var setup = Setup(ReminderStoreTests.Cipher(""));

        var result = await setup.SaveAsync(_clan, Url, TwoHours, default);

        Assert.Equal(new ReminderSetupResult.Refused(ReminderProblem.Unavailable), result);
        Assert.False(setup.For(_clan).IsAvailable);
    }

    [Fact]
    public async Task TheRegisteredDiscordClient_NeverLogsTheWebhookUrl()
    {
        var logs = new CapturingLoggerProvider();
        var services = new ServiceCollection();
        services.AddLogging(b => b.AddProvider(logs).SetMinimumLevel(LogLevel.Trace));
        services.AddDiscordReminders(Path.GetTempPath());
        services.AddHttpClient<DiscordWebhookClient>().ConfigurePrimaryHttpMessageHandler(() => _http);
        services.AddHttpClient("unprotected").ConfigurePrimaryHttpMessageHandler(() => _http);
        using var provider = services.BuildServiceProvider();
        var factory = provider.GetRequiredService<IHttpClientFactory>();
        Assert.True(DiscordWebhook.TryParse(Url, out var webhook));

        var discord = new DiscordWebhookClient(factory.CreateClient(nameof(DiscordWebhookClient)));
        await discord.GetAsync(webhook, default);
        await discord.PostAsync(webhook, ReminderMessage.Test(DummyWar(), TwoHours), default);
        Assert.DoesNotContain(logs.Messages, m => m.Contains(DiscordWebhookTests.Token, StringComparison.Ordinal));

        await factory.CreateClient("unprotected").GetAsync(webhook.Url);
        Assert.Contains(logs.Messages, m => m.Contains(DiscordWebhookTests.Token, StringComparison.Ordinal));
    }

    private static ClanWar DummyWar() => new("#L9VRJ", "Example", null, WarPeriod.WarDay, 1, [], [], [], Reset, null);

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly List<string> _messages = [];

        public IReadOnlyList<string> Messages
        {
            get
            {
                lock (_messages)
                {
                    return _messages.ToList();
                }
            }
        }

        public ILogger CreateLogger(string categoryName) => new Logger(this);

        public void Dispose()
        {
        }

        private sealed class Logger(CapturingLoggerProvider owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                lock (owner._messages)
                {
                    owner._messages.Add(formatter(state, exception));
                }
            }
        }
    }
}
