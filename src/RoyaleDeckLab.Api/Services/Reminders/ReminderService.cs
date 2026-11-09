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
            try
            {
                await RemindClanAsync(clanReminders.ToList(), now, ct);
            }
            // A clan that can't be looked up mustn't hold up the clans after it. It isn't counted as a failed post:
            // a few minutes of CR API trouble shouldn't cost the clan its reminder, and the window ends at the reset.
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Discord reminders of clan {Clan} failed; trying again next minute", clanReminders.Key);
            }
        }
    }

    private async Task RemindClanAsync(List<DiscordReminder> reminders, DateTimeOffset now, CancellationToken ct)
    {
        var war = await clanWars.GetAsync(reminders[0].Clan, ct);
        foreach (var reminder in reminders)
        {
            await RemindAsync(reminder, war, now, ct);
        }
    }

    private async Task RemindAsync(DiscordReminder reminder, ClanWar war, DateTimeOffset now, CancellationToken ct)
    {
        var webhookId = reminder.Webhook.Id;
        var reset = reminder.NextReset(now);
        if (war.DayEndsAt is { } dayEndsAt)
        {
            store.UpdateResetTime(webhookId, dayEndsAt);
            reset = dayEndsAt;
        }

        if (!store.TryClaim(webhookId, reset))
        {
            return;
        }
        var isAllDone = war.DecksLeftToday == 0;
        var hasNothingToPost = !war.IsBattleDay || (isAllDone && !reminder.Settings.PostWhenAllDone);
        if (hasNothingToPost)
        {
            return;
        }

        using var http = httpFactory.CreateClient(nameof(DiscordWebhookClient));
        var discord = new DiscordWebhookClient(http);
        var outcome = await discord.PostAsync(reminder.Webhook, ReminderMessage.Reminder(war, reminder.Settings, reset), ct);
        switch (outcome)
        {
            case WebhookPostOutcome.Posted:
                break;
            case WebhookPostOutcome.NotPosted:
                store.ReleaseClaim(reset, reminder.AfterFailure(reset));
                logger.LogInformation("Discord didn't take the reminder of clan {Clan}; trying again next minute", reminder.Clan);
                break;
            case WebhookPostOutcome.MaybePosted:
                logger.LogWarning("The Discord reminder of clan {Clan} may not have arrived; not retried, so it can't post twice", reminder.Clan);
                break;
            case WebhookPostOutcome.WebhookGone:
                await RemoveIfGoneAsync(discord, reminder, reset, ct);
                break;
        }
    }

    /// <summary>Asks Discord once more before deleting, so one odd answer can't silently remove a clan's reminder.</summary>
    private async Task RemoveIfGoneAsync(DiscordWebhookClient discord, DiscordReminder reminder, DateTimeOffset reset, CancellationToken ct)
    {
        var lookup = await discord.GetAsync(reminder.Webhook, ct);
        if (lookup is not WebhookLookup.Gone)
        {
            store.ReleaseClaim(reset, reminder.AfterFailure(reset));
            return;
        }
        store.Delete(reminder.Webhook.Id);
        logger.LogInformation("Removed the Discord reminder of clan {Clan}: its webhook is gone", reminder.Clan);
    }
}
