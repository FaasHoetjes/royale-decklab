using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Clients;

public enum WebhookPostOutcome
{
    Posted,

    /// <summary>Discord no longer knows the webhook: someone deleted it, or its token changed.</summary>
    WebhookGone,

    /// <summary>Discord definitely didn't post it: it refused the request, or the request never reached it.</summary>
    NotPosted,

    /// <summary>The request reached Discord but the answer didn't come back, so the message may be in the channel.</summary>
    MaybePosted,
}

public abstract record WebhookLookup
{
    public sealed record Found(DiscordWebhookInfo Info) : WebhookLookup;

    /// <summary>Discord doesn't know the webhook, or the token is wrong.</summary>
    public sealed record Gone : WebhookLookup;

    public sealed record Failed : WebhookLookup;
}

/// <summary>
/// Posts to Discord webhooks. A webhook's token is part of its URL, so this client is registered without
/// HttpClient's request logging and never puts the URL into a message of its own.
/// </summary>
public sealed class DiscordWebhookClient(HttpClient http)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public async Task<WebhookLookup> GetAsync(DiscordWebhook webhook, CancellationToken ct)
    {
        try
        {
            using var response = await http.GetAsync(webhook.Url, ct);
            if (IsGone(response.StatusCode))
            {
                return new WebhookLookup.Gone();
            }
            if (!response.IsSuccessStatusCode)
            {
                return new WebhookLookup.Failed();
            }
            var info = await response.Content.ReadFromJsonAsync<DiscordWebhookInfo>(Json, ct);
            return info is null ? new WebhookLookup.Failed() : new WebhookLookup.Found(info);
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException || (ex is TaskCanceledException && !ct.IsCancellationRequested))
        {
            return new WebhookLookup.Failed();
        }
    }

    public async Task<WebhookPostOutcome> PostAsync(DiscordWebhook webhook, DiscordMessage message, CancellationToken ct)
    {
        try
        {
            using var response = await http.PostAsJsonAsync(webhook.Url, message, Json, ct);
            return OutcomeOf(response.StatusCode);
        }
        catch (HttpRequestException ex) when (NeverReachedDiscord(ex))
        {
            return WebhookPostOutcome.NotPosted;
        }
        catch (HttpRequestException)
        {
            return WebhookPostOutcome.MaybePosted;
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return WebhookPostOutcome.MaybePosted;
        }
    }

    private static WebhookPostOutcome OutcomeOf(HttpStatusCode status)
    {
        if (IsGone(status))
        {
            return WebhookPostOutcome.WebhookGone;
        }
        var code = (int)status;
        if (code is >= 200 and < 300)
        {
            return WebhookPostOutcome.Posted;
        }
        var isRefused = code is >= 400 and < 500;
        return isRefused ? WebhookPostOutcome.NotPosted : WebhookPostOutcome.MaybePosted;
    }

    private static bool NeverReachedDiscord(HttpRequestException ex) => ex.HttpRequestError
        is HttpRequestError.NameResolutionError
        or HttpRequestError.ConnectionError
        or HttpRequestError.SecureConnectionError;

    private static bool IsGone(HttpStatusCode status) => status is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized;
}
