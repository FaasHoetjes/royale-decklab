using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class DiscordReminderTests
{
    private static readonly DateTimeOffset Reset = new(2026, 11, 9, 9, 39, 0, TimeSpan.Zero);

    private static DiscordReminder TwoHoursBefore()
    {
        Assert.True(ClanTag.TryParse("L9VRJ", out var clan));
        var settings = new ReminderSettings(2, ReminderMessageStyle.Short, ReminderPing.Nobody, false);
        return DiscordReminder.Create(new DiscordWebhook(DiscordWebhookTests.Id, DiscordWebhookTests.Token), clan, settings, Reset);
    }

    [Fact]
    public void IsDue_FromTheChosenHoursBeforeReset_UntilTheReset()
    {
        var reminder = TwoHoursBefore();

        Assert.False(reminder.IsDue(Reset.AddHours(-2).AddMinutes(-1)));
        Assert.True(reminder.IsDue(Reset.AddHours(-2)));
        Assert.True(reminder.IsDue(Reset.AddMinutes(-1)));
        Assert.False(reminder.IsDue(Reset));
        Assert.True(reminder.IsDue(Reset.AddDays(1).AddHours(-1)));
    }

    [Fact]
    public void PostsOncePerDay_EvenWhenTheResetTimeMovesALittle()
    {
        var reminded = TwoHoursBefore().RemindedFor(Reset);

        var moved = reminded.WithResetAt(Reset.AddMinutes(3));

        Assert.False(moved.IsDue(Reset.AddMinutes(-30)));
        Assert.True(moved.IsDue(Reset.AddDays(1).AddHours(-1)));
    }

    [Fact]
    public void GivesUpOnTheDay_AfterRepeatedFailures()
    {
        var now = Reset.AddHours(-1);
        var reminder = TwoHoursBefore();

        for (var i = 0; i < DiscordReminder.MaxFailuresPerDay - 1; i++)
        {
            reminder = reminder.AfterFailure(Reset);
            Assert.True(reminder.IsDue(now));
        }
        reminder = reminder.AfterFailure(Reset);

        Assert.False(reminder.IsDue(now));
        Assert.Equal(0, reminder.Failures);
        Assert.True(reminder.IsDue(Reset.AddDays(1).AddHours(-1)));
    }

    [Theory]
    [InlineData(1, true)]
    [InlineData(6, true)]
    [InlineData(4, false)]
    [InlineData(0, false)]
    public void AcceptsOnlyTheOfferedHours(int hours, bool isValid)
    {
        var settings = new ReminderSettings(hours, ReminderMessageStyle.Full, ReminderPing.Here, true);

        Assert.Equal(isValid, settings.IsValid);
    }

    [Fact]
    public void RejectsUnknownStyleOrPing()
    {
        Assert.False(new ReminderSettings(2, (ReminderMessageStyle)9, ReminderPing.Nobody, false).IsValid);
        Assert.False(new ReminderSettings(2, ReminderMessageStyle.Short, (ReminderPing)9, false).IsValid);
    }
}
