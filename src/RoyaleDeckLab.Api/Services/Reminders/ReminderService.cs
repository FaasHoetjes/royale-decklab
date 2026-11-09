using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Reminders;

/// <summary>
/// Every minute, posts the war reminders that are due. A clan is looked up once however many channels it posts to,
/// through the same one-minute cache the planner uses.
/// </summary>
public sealed class ReminderService(
    ReminderStore store,
    WebhookTokenCipher cipher,
    ClanWarCache clanWars,
    IHttpClientFactory httpFactory,
    TimeProvider clock,
    ILogger<ReminderService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!cipher.IsAvailable)
        {
            return;
        }
        try
        {
            using var timer = new PeriodicTimer(Interval, clock);
            do
            {
                try
                {
                    await PostDueAsync(stoppingToken);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    logger.LogError(ex, "Posting Discord reminders failed; retrying on the next tick");
                }
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
        }
    }

    public async Task PostDueAsync(CancellationToken ct)
    {
        var now = clock.GetUtcNow();
        var dueByClan = store.All()
            .Where(r => r.IsDue(now))
            .GroupBy(r => r.Clan.Value);

        foreach (var clanReminders in dueByClan)
        {
            var reminders = clanReminders.ToList();
            ClanWar war;
            try
            {
                war = await clanWars.GetAsync(reminders[0].Clan, ct);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning("Couldn't look up clan {Clan} for its Discord reminder: {Status}", clanReminders.Key, ex.StatusCode);
                foreach (var reminder in reminders)
                {
                    store.Save(reminder.AfterFailure(reminder.NextReset(now)));
                }
                continue;
            }

            foreach (var reminder in reminders)
            {
                await RemindAsync(reminder, war, now, ct);
            }
        }
    }

    private async Task RemindAsync(DiscordReminder reminder, ClanWar war, DateTimeOffset now, CancellationToken ct)
    {
        var reset = reminder.NextReset(now);
        if (war.DayEndsAt is { } dayEndsAt)
        {
            reminder = reminder.WithResetAt(dayEndsAt);
            reset = dayEndsAt;
        }

        var isAllDone = war.DecksLeftToday == 0;
        var hasNothingToPost = !war.IsBattleDay || (isAllDone && !reminder.Settings.PostWhenAllDone);
        if (hasNothingToPost)
        {
            store.Save(reminder.RemindedFor(reset));
            return;
        }

        using var http = httpFactory.CreateClient(nameof(DiscordWebhookClient));
        var discord = new DiscordWebhookClient(http);
        var outcome = await discord.PostAsync(reminder.Webhook, ReminderMessage.Reminder(war, reminder.Settings, reset), ct);
        switch (outcome)
        {
            case WebhookPostOutcome.Posted:
                store.Save(reminder.RemindedFor(reset));
                break;
            case WebhookPostOutcome.WebhookGone:
                store.Delete(reminder.Webhook.Id);
                logger.LogInformation("Removed the Discord reminder of clan {Clan}: its webhook is gone", reminder.Clan);
                break;
            case WebhookPostOutcome.RateLimited:
                break;
            case WebhookPostOutcome.Failed:
                store.Save(reminder.AfterFailure(reset));
                logger.LogWarning("Posting the Discord reminder of clan {Clan} failed", reminder.Clan);
                break;
        }
    }
}
