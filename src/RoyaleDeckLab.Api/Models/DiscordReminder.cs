namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// One Discord channel that gets a clan's war reminder. The clan's day resets at the same time of day every day, so
/// the reminder knows when it's due without asking the CR API; each post re-learns that time in case it moved.
/// </summary>
public sealed record DiscordReminder(
    DiscordWebhook Webhook,
    ClanTag Clan,
    ReminderSettings Settings,
    TimeSpan ResetTimeOfDay,
    DateTimeOffset? LastRemindedFor,
    int Failures)
{
    public const int MaxFailuresPerDay = 3;

    /// <summary>A reset time that moved this little since the last post is still the same war day.</summary>
    public static readonly TimeSpan SameDay = TimeSpan.FromHours(12);

    public static DiscordReminder Create(DiscordWebhook webhook, ClanTag clan, ReminderSettings settings, DateTimeOffset dayEndsAt)
        => new(webhook, clan, settings, dayEndsAt.UtcDateTime.TimeOfDay, null, 0);

    public DateTimeOffset NextReset(DateTimeOffset now) => WarDay.NextReset(ResetTimeOfDay, now);

    public bool IsDue(DateTimeOffset now) => IsDue(ResetTimeOfDay, Settings.HoursBeforeReset, LastRemindedFor, now);

    /// <summary>Takes only what decides it, so the store can tell before it decrypts a reminder's token.</summary>
    public static bool IsDue(TimeSpan resetTimeOfDay, int hoursBeforeReset, DateTimeOffset? lastRemindedFor, DateTimeOffset now)
    {
        var reset = WarDay.NextReset(resetTimeOfDay, now);
        var remindAt = reset - TimeSpan.FromHours(hoursBeforeReset);
        return now >= remindAt && !HasRemindedFor(lastRemindedFor, reset);
    }

    public DiscordReminder RemindedFor(DateTimeOffset reset) => this with { LastRemindedFor = reset, Failures = 0 };

    /// <summary>After a few failed posts the reminder gives up on today and tries again tomorrow.</summary>
    public DiscordReminder AfterFailure(DateTimeOffset reset)
    {
        var failures = Failures + 1;
        if (failures >= MaxFailuresPerDay)
        {
            return RemindedFor(reset);
        }
        return this with { Failures = failures };
    }

    private static bool HasRemindedFor(DateTimeOffset? lastRemindedFor, DateTimeOffset reset)
        => lastRemindedFor is { } last && (reset - last).Duration() < SameDay;
}
