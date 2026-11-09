using System.Net;
using System.Threading.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Dtos;
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

    /// <summary>The site holds as many reminders as it takes.</summary>
    TooManyReminders,

    /// <summary>The webhook's Discord server already posts as many reminders as one server may.</summary>
    TooManyForServer,

    /// <summary>This webhook doesn't post this clan's reminders.</summary>
    NotRegistered,
    DiscordFailed,
    ClashRoyaleFailed,

    /// <summary>The site is making as many requests to Discord as it allows itself, for everyone together.</summary>
    Busy,
}

public sealed record ClanReminders(bool IsAvailable, IReadOnlyList<ReminderSettings> Reminders);

public abstract record ReminderSetupResult
{
    public sealed record Saved(string? WebhookName) : ReminderSetupResult;

    public sealed record Refused(ReminderProblem Problem) : ReminderSetupResult;
}

/// <summary>
/// Turning a clan's Discord reminders on, testing and turning them off. There are no accounts: whoever has the
/// webhook URL controls what's posted to it, so pasting the URL is what proves it's theirs. Anyone may post any clan's
/// reminders to their own channel, so the limits are per Discord server and for the whole site, never per clan.
/// </summary>
public sealed class DiscordReminderSetup(
    ReminderStore store,
    WebhookTokenCipher cipher,
    ClanWarCache clanWars,
    IHttpClientFactory httpFactory,
    ILogger<DiscordReminderSetup> logger)
{
    public const int MaxPerServer = 10;
    public const int MaxReminders = 5_000;

    /// <summary>
    /// Discord blocks an IP that makes too many failing requests, and anyone can make setup call Discord with a made-up
    /// webhook. This keeps everyone's setup calls together far below that limit.
    /// </summary>
    public const int DiscordCallsPerMinute = 60;

    private readonly FixedWindowRateLimiter _discordBudget = new(new FixedWindowRateLimiterOptions
    {
        PermitLimit = DiscordCallsPerMinute,
        Window = TimeSpan.FromMinutes(1),
        QueueLimit = 0,
    });

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

        var isNew = store.Find(webhook.Id) is null;
        if (isNew && store.Count() >= MaxReminders)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.TooManyReminders);
        }

        var warLookup = await LookUpWarAsync(clan, ct);
        if (warLookup is not WarLookup.Found { War: var war })
        {
            return new ReminderSetupResult.Refused(ProblemOf(warLookup));
        }
        if (war.DayEndsAt is not { } dayEndsAt)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.NoResetTime);
        }

        var webhookCheck = await LookUpWebhookAsync(webhook, ct);
        if (webhookCheck is not WebhookCheck.Found { Info: var info })
        {
            return new ReminderSetupResult.Refused(ProblemOf(webhookCheck));
        }
        if (info.GuildId is not { } guildId)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.InvalidWebhook);
        }
        if (isNew && store.CountForServer(guildId) >= MaxPerServer)
        {
            return new ReminderSetupResult.Refused(ReminderProblem.TooManyForServer);
        }

        store.Save(DiscordReminder.Create(webhook, clan, settings, dayEndsAt), guildId);
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

        var warLookup = await LookUpWarAsync(clan, ct);
        if (warLookup is not WarLookup.Found { War: var war })
        {
            return ProblemOf(warLookup);
        }

        using var lease = _discordBudget.AttemptAcquire();
        if (!lease.IsAcquired)
        {
            return ReminderProblem.Busy;
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

    private async Task<WarLookup> LookUpWarAsync(ClanTag clan, CancellationToken ct)
    {
        try
        {
            return new WarLookup.Found(await clanWars.GetAsync(clan, ct));
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return new WarLookup.Refused(ReminderProblem.ClanNotFound);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Couldn't look up clan {Clan} to set up its Discord reminder", clan);
            return new WarLookup.Refused(ReminderProblem.ClashRoyaleFailed);
        }
    }

    private async Task<WebhookCheck> LookUpWebhookAsync(DiscordWebhook webhook, CancellationToken ct)
    {
        using var lease = _discordBudget.AttemptAcquire();
        if (!lease.IsAcquired)
        {
            return new WebhookCheck.Refused(ReminderProblem.Busy);
        }
        using var http = httpFactory.CreateClient(nameof(DiscordWebhookClient));
        return await new DiscordWebhookClient(http).GetAsync(webhook, ct) switch
        {
            WebhookLookup.Found found => new WebhookCheck.Found(found.Info),
            WebhookLookup.Gone => new WebhookCheck.Refused(ReminderProblem.WebhookNotFound),
            _ => new WebhookCheck.Refused(ReminderProblem.DiscordFailed),
        };
    }

    private static ReminderProblem ProblemOf(WarLookup lookup) => lookup switch
    {
        WarLookup.Refused refused => refused.Problem,
        _ => throw new InvalidOperationException("A found clan has no problem"),
    };

    private static ReminderProblem ProblemOf(WebhookCheck check) => check switch
    {
        WebhookCheck.Refused refused => refused.Problem,
        _ => throw new InvalidOperationException("A found webhook has no problem"),
    };

    private abstract record WarLookup
    {
        public sealed record Found(ClanWar War) : WarLookup;

        public sealed record Refused(ReminderProblem Problem) : WarLookup;
    }

    private abstract record WebhookCheck
    {
        public sealed record Found(DiscordWebhookInfo Info) : WebhookCheck;

        public sealed record Refused(ReminderProblem Problem) : WebhookCheck;
    }
}
