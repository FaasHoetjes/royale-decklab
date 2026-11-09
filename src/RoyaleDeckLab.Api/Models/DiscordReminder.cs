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

    public DateTimeOffset NextReset(DateTimeOffset now)
    {
        var today = new DateTimeOffset(now.UtcDateTime.Date, TimeSpan.Zero);
        var reset = today + ResetTimeOfDay;
        return reset > now ? reset : reset.AddDays(1);
    }

    public bool IsDue(DateTimeOffset now)
    {
        var reset = NextReset(now);
        var remindAt = reset - TimeSpan.FromHours(Settings.HoursBeforeReset);
        return now >= remindAt && !HasRemindedFor(reset);
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

    public DiscordReminder WithResetAt(DateTimeOffset dayEndsAt) => this with { ResetTimeOfDay = dayEndsAt.UtcDateTime.TimeOfDay };

    public DiscordReminder WithSettings(ClanTag clan, ReminderSettings settings) => this with { Clan = clan, Settings = settings };

    private bool HasRemindedFor(DateTimeOffset reset)
        => LastRemindedFor is { } last && (reset - last).Duration() < SameDay;
}
