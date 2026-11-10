using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Reminders;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ReminderStoreTests : IDisposable
{
    private const string Guild = "1100000000000000001";
    private static readonly DateTimeOffset Reset = new(2026, 11, 9, 9, 39, 0, TimeSpan.Zero);

    private readonly string _path = Path.Combine(Path.GetTempPath(), $"reminders-{Guid.NewGuid():N}.db");
    private readonly WebhookTokenCipher _cipher = Cipher(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)));
    private readonly ReminderStore _store;
    private readonly ClanTag _clan;

    public ReminderStoreTests()
    {
        _store = new ReminderStore(_path, _cipher, NullLogger<ReminderStore>.Instance);
        Assert.True(ClanTag.TryParse("L9VRJ", out var clan));
        _clan = clan;
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            File.Delete(file);
        }
    }

    public static WebhookTokenCipher Cipher(string key)
        => new(Microsoft.Extensions.Options.Options.Create(new ReminderOptions { EncryptionKey = key }), NullLogger<WebhookTokenCipher>.Instance);

    private DiscordReminder Reminder(ReminderSettings? settings = null)
    {
        var webhook = new DiscordWebhook(DiscordWebhookTests.Id, DiscordWebhookTests.Token);
        return DiscordReminder.Create(webhook, _clan, settings ?? new ReminderSettings(3, ReminderMessageStyle.Full, ReminderPing.Here, true), Reset);
    }

    private DiscordReminder Stored() => Assert.Single(_store.All());

    [Fact]
    public void SavesAndReadsBack_TheWholeReminder()
    {
        var reminder = Reminder();

        _store.Save(reminder, Guild);

        var read = Assert.Single(_store.ForClan(_clan));
        Assert.Equal(reminder.Settings, read.Settings);
        Assert.Equal(reminder.ResetTimeOfDay, read.ResetTimeOfDay);
        Assert.Null(read.LastRemindedFor);
        Assert.Equal(DiscordWebhookTests.Token, read.Webhook.Token);
    }

    [Fact]
    public void KeepsTheTokenOutOfTheFile()
    {
        _store.Save(Reminder(), Guild);
        SqliteConnection.ClearAllPools();

        var bytes = File.ReadAllBytes(_path).Concat(File.Exists(_path + "-wal") ? File.ReadAllBytes(_path + "-wal") : []).ToArray();

        Assert.DoesNotContain(DiscordWebhookTests.Token, Encoding.ASCII.GetString(bytes));
    }

    [Fact]
    public void DeletesTheReminder()
    {
        _store.Save(Reminder(), Guild);

        _store.Delete(DiscordWebhookTests.Id);

        Assert.Empty(_store.All());
        Assert.Null(_store.Find(DiscordWebhookTests.Id));
    }

    [Fact]
    public void ClaimsEachResetOnce()
    {
        _store.Save(Reminder(), Guild);

        Assert.True(_store.TryClaim(DiscordWebhookTests.Id, Reset));
        Assert.False(_store.TryClaim(DiscordWebhookTests.Id, Reset.AddMinutes(5)));
        Assert.True(_store.TryClaim(DiscordWebhookTests.Id, Reset.AddDays(1)));
    }

    [Fact]
    public void ChangingSettings_KeepsWhenItLastPosted()
    {
        _store.Save(Reminder(), Guild);
        _store.TryClaim(DiscordWebhookTests.Id, Reset);

        _store.Save(Reminder(new ReminderSettings(1, ReminderMessageStyle.Short, ReminderPing.Nobody, false)), Guild);

        Assert.Equal(Reset, Stored().LastRemindedFor);
        Assert.Equal(1, Stored().Settings.HoursBeforeReset);
    }

    [Fact]
    public void MovingToAnotherClan_StartsItsPostsAfresh()
    {
        _store.Save(Reminder(), Guild);
        _store.TryClaim(DiscordWebhookTests.Id, Reset);
        Assert.True(ClanTag.TryParse("PPPPP", out var other));

        _store.Save(Reminder() with { Clan = other }, Guild);

        Assert.Null(Stored().LastRemindedFor);
    }

    [Fact]
    public void ReleasingAClaim_OnlyUndoesItsOwnClaim()
    {
        var before = Reminder();
        _store.Save(before, Guild);
        _store.TryClaim(DiscordWebhookTests.Id, Reset);

        _store.ReleaseClaim(Reset.AddDays(1), before.AfterFailure(Reset.AddDays(1)));
        Assert.Equal(Reset, Stored().LastRemindedFor);

        _store.ReleaseClaim(Reset, before.AfterFailure(Reset));
        Assert.Null(Stored().LastRemindedFor);
        Assert.Equal(1, Stored().Failures);
    }

    [Fact]
    public void TheJobsWrites_NeverBringBackADeletedReminder()
    {
        var reminder = Reminder();
        _store.Save(reminder, Guild);
        _store.Delete(DiscordWebhookTests.Id);

        Assert.False(_store.TryClaim(DiscordWebhookTests.Id, Reset));
        _store.ReleaseClaim(Reset, reminder.AfterFailure(Reset));
        _store.UpdateResetTime(DiscordWebhookTests.Id, Reset);

        Assert.Empty(_store.All());
    }

    [Fact]
    public void ANewReminder_IsRefusedOnceALimitIsReached()
    {
        Assert.Equal(ReminderSaveOutcome.TooManyReminders, _store.SaveWithinLimits(Reminder(), Guild, maxReminders: 0, maxPerServer: 5));
        Assert.Equal(ReminderSaveOutcome.TooManyForServer, _store.SaveWithinLimits(Reminder(), Guild, maxReminders: 5, maxPerServer: 0));
        Assert.Empty(_store.All());
    }

    [Fact]
    public void AnExistingReminder_CanStillChangeAtTheLimit()
    {
        _store.Save(Reminder(), Guild);
        var changed = Reminder(new ReminderSettings(1, ReminderMessageStyle.Short, ReminderPing.Nobody, false));

        var outcome = _store.SaveWithinLimits(changed, Guild, maxReminders: 1, maxPerServer: 1);

        Assert.Equal(ReminderSaveOutcome.Saved, outcome);
        Assert.Equal(changed.Settings, Stored().Settings);
    }

    [Fact]
    public void Due_GivesOnlyTheRemindersInTheirWindow()
    {
        _store.Save(Reminder(), Guild);

        Assert.Empty(_store.Due(Reset.AddHours(-4)));
        Assert.Equal(DiscordWebhookTests.Token, Assert.Single(_store.Due(Reset.AddHours(-2))).Webhook.Token);
    }

    [Fact]
    public void CountsRemindersPerDiscordServer()
    {
        _store.Save(Reminder(), Guild);

        Assert.Equal(1, _store.CountForServer(Guild));
        Assert.Equal(0, _store.CountForServer("1100000000000000002"));
    }

    [Fact]
    public void SkipsTokensItCantRead_UntilTheWebhookIsSavedAgain()
    {
        _store.Save(Reminder(), Guild);
        var otherKey = new ReminderStore(_path, Cipher(Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))), NullLogger<ReminderStore>.Instance);

        Assert.Empty(otherKey.All());
        Assert.Equal(0, otherKey.Count());
        Assert.Equal(1, otherKey.RowCount());
        Assert.Null(otherKey.Find(DiscordWebhookTests.Id));

        otherKey.Save(Reminder(), Guild);
        Assert.Equal(DiscordWebhookTests.Token, Assert.Single(otherKey.All()).Webhook.Token);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not base64!")]
    [InlineData("c2hvcnQ=")]
    public void IsOff_WithoutAValidKey(string key)
    {
        Assert.False(Cipher(key).IsAvailable);
    }

    [Fact]
    public void TokenOnlyDecrypts_UnderItsOwnWebhook()
    {
        var sealedToken = _cipher.Encrypt(DiscordWebhookTests.Id, DiscordWebhookTests.Token);

        Assert.Equal(DiscordWebhookTests.Token, _cipher.Decrypt(DiscordWebhookTests.Id, sealedToken));
        Assert.ThrowsAny<CryptographicException>(() => _cipher.Decrypt("1301234567890123457", sealedToken));
    }
}
