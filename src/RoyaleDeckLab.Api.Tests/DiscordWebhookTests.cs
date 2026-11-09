using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DiscordWebhookTests
{
    public const string Id = "1301234567890123456";
    public const string Token = "kX9fAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOpQrStUvWx";

    [Theory]
    [InlineData("https://discord.com/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://discordapp.com/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://ptb.discord.com/api/v10/webhooks/" + Id + "/" + Token + "/")]
    [InlineData("  https://canary.discord.com/api/webhooks/" + Id + "/" + Token + "?wait=true  ")]
    public void ReadsTheIdAndToken_FromAWebhookUrl(string url)
    {
        Assert.True(DiscordWebhook.TryParse(url, out var webhook));

        Assert.Equal(Id, webhook.Id);
        Assert.Equal(Token, webhook.Token);
        Assert.Equal($"https://discord.com/api/webhooks/{Id}/{Token}", webhook.Url.ToString());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("not a url")]
    [InlineData("http://discord.com/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://discord.com:8443/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://evil.example/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://discord.com.evil.example/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://discord.com@evil.example/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://user@discord.com/api/webhooks/" + Id + "/" + Token)]
    [InlineData("https://discord.com/api/webhooks/" + Id)]
    [InlineData("https://discord.com/api/webhooks/" + Id + "/" + Token + "/github")]
    [InlineData("https://discord.com/api/webhooks/abc/" + Token)]
    [InlineData("https://discord.com/api/webhooks/" + Id + "/short")]
    [InlineData("https://discord.com/channels/" + Id + "/" + Id)]
    public void RejectsAnythingButADiscordWebhookUrl(string? url)
    {
        Assert.False(DiscordWebhook.TryParse(url, out _));
    }

    [Theory]
    [InlineData("١٣٠١٢٣٤٥٦٧٨٩٠١٢٣٤٥٦", Token)]
    [InlineData(Id + "\n", Token)]
    [InlineData(Id, Token + "\n")]
    [InlineData(Id, "kX9fAbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdEfGhIjKlMnOpQrStUvWé")]
    public void RefusesAnIdOrTokenDiscordWouldNeverIssue(string id, string token)
    {
        Assert.Throws<FormatException>(() => new DiscordWebhook(id, token));
    }

    [Fact]
    public void NeverShowsTheToken_WhenPrinted()
    {
        Assert.True(DiscordWebhook.TryParse($"https://discord.com/api/webhooks/{Id}/{Token}", out var webhook));

        Assert.DoesNotContain(Token, webhook.ToString());
        Assert.True(ClanTag.TryParse("L9VRJ", out var clan));
        var settings = new ReminderSettings(2, ReminderMessageStyle.Short, ReminderPing.Nobody, false);
        var reminder = DiscordReminder.Create(webhook, clan, settings, DateTimeOffset.UnixEpoch);
        Assert.DoesNotContain(Token, reminder.ToString());
    }

    [Fact]
    public void MatchesOnlyTheSameToken()
    {
        var webhook = new DiscordWebhook(Id, Token);
        var otherToken = new DiscordWebhook(Id, Token.Replace('k', 'q'));

        Assert.True(webhook.HasSameToken(new DiscordWebhook(Id, Token)));
        Assert.False(webhook.HasSameToken(otherToken));
    }
}
