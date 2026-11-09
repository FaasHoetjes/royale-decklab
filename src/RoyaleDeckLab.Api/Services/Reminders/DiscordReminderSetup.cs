using System.Net;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Reminders;

public enum ReminderProblem
{
    /// <summary>The server has no encryption key, so Discord reminders are off.</summary>
    Unavailable,
    InvalidWebhook,
    InvalidSettings,
    ClanNotFound,

    /// <summary>The clan hasn't finished a river race yet, so there's no day reset time to remind before.</summary>
    NoResetTime,

    /// <summary>Discord doesn't know the webhook, or the token is wrong.</summary>
    WebhookNotFound,
    TooManyReminders,

    /// <summary>This webhook doesn't post this clan's reminders.</summary>
    NotRegistered,
    DiscordFailed,
}

public sealed record ClanReminders(bool IsAvailable, IReadOnlyList<ReminderSettings> Reminders);

public abstract record ReminderSetupResult
{
    public sealed record Saved(string? WebhookName) : ReminderSetupResult;

    public sealed record Refused(ReminderProblem Problem) : ReminderSetupResult;
}

/// <summary>
/// Turning a clan's Discord reminders on, testing and turning them off. There are no accounts: whoever has the
/// webhook URL controls what's posted to it, so pasting the URL is what proves it's theirs.
/// </summary>
public sealed class DiscordReminderSetup(
    ReminderStore store,
    WebhookTokenCipher cipher,
    ClanWarCache clanWars,
    IHttpClientFactory httpFactory)
{
    public const int MaxPerClan = 10;
    public const int MaxReminders = 5_000;

    public ClanReminders For(ClanTag clan)
    {
        if (!cipher.IsAvailable)
        {
            return new ClanReminders(false, []);
        }
        var settings = store.ForClan(clan)
            .Select(r => r.Settings)
            .ToList();
        return new ClanReminders(true, settings);
    }

    public async Task<ReminderSetupResult> SaveAsync(ClanTag clan, string webhookUrl, ReminderSettings settings, CancellationToken ct)
    {
        if (Check(webhookUrl, settings) is { } problem)
        {
            return new ReminderSetupResult.Refused(problem);
        }
        if (!DiscordWebhook.TryParse(webhookUrl, out var webhook))
        {
            return new ReminderSetupResult.Refused(ReminderProblem.InvalidWebhook);
        }

        var existing = store.Find(webhook.Id);
        var isFull = existing is null && (store.ForClan(clan).Count >= MaxPerClan || store.Count() >= MaxReminders);
        if (isFull)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.TooManyReminders);
        }

        var war = await WarOrNullAsync(clan, ct);
        if (war is null)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.ClanNotFound);
        }
        if (war.DayEndsAt is not { } dayEndsAt)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.NoResetTime);
        }

        using var http = httpFactory.CreateClient(nameof(DiscordWebhookClient));
        var info = await new DiscordWebhookClient(http).GetAsync(webhook, ct);
        if (info is null)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.WebhookNotFound);
        }

        var reminder = existing is null
            ? DiscordReminder.Create(webhook, clan, settings, dayEndsAt)
            : (existing with { Webhook = webhook }).WithSettings(clan, settings).WithResetAt(dayEndsAt);
        store.Save(reminder);
        return new ReminderSetupResult.Saved(info.Name);
    }

    /// <summary>Posts a message saying where the reminders will appear. Null when it was posted.</summary>
    public async Task<ReminderProblem?> TestAsync(ClanTag clan, string webhookUrl, ReminderSettings settings, CancellationToken ct)
    {
        if (Check(webhookUrl, settings) is { } problem)
        {
            return problem;
        }
        if (!DiscordWebhook.TryParse(webhookUrl, out var webhook))
        {
            return ReminderProblem.InvalidWebhook;
        }

        var war = await WarOrNullAsync(clan, ct);
        if (war is null)
        {
            return ReminderProblem.ClanNotFound;
        }

        using var http = httpFactory.CreateClient(nameof(DiscordWebhookClient));
        var outcome = await new DiscordWebhookClient(http).PostAsync(webhook, ReminderMessage.Test(war, settings), ct);
        return outcome switch
        {
            WebhookPostOutcome.Posted => null,
            WebhookPostOutcome.WebhookGone => ReminderProblem.WebhookNotFound,
            _ => ReminderProblem.DiscordFailed,
        };
    }

    /// <summary>Removes the reminder, if this webhook posts it for this clan. Null when it was removed.</summary>
    public ReminderProblem? Delete(ClanTag clan, string webhookUrl)
    {
        if (!cipher.IsAvailable)
        {
            return ReminderProblem.Unavailable;
        }
        if (!DiscordWebhook.TryParse(webhookUrl, out var webhook))
        {
            return ReminderProblem.InvalidWebhook;
        }

        var existing = store.Find(webhook.Id);
        var isThisClansWebhook = existing is not null
            && existing.Clan == clan
            && existing.Webhook.HasSameToken(webhook);
        if (!isThisClansWebhook)
        {
            return ReminderProblem.NotRegistered;
        }

        store.Delete(webhook.Id);
        return null;
    }

    private ReminderProblem? Check(string webhookUrl, ReminderSettings settings)
    {
        if (!cipher.IsAvailable)
        {
            return ReminderProblem.Unavailable;
        }
        if (!settings.IsValid)
        {
            return ReminderProblem.InvalidSettings;
        }
        if (string.IsNullOrWhiteSpace(webhookUrl))
        {
            return ReminderProblem.InvalidWebhook;
        }
        return null;
    }

    private async Task<ClanWar?> WarOrNullAsync(ClanTag clan, CancellationToken ct)
    {
        try
        {
            return await clanWars.GetAsync(clan, ct);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }
    }
}
