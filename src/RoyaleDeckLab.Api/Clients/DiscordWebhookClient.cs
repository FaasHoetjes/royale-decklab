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
    RateLimited,
    Failed,
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

    /// <summary>Null when Discord doesn't know the webhook or the token is wrong.</summary>
    public async Task<DiscordWebhookInfo?> GetAsync(DiscordWebhook webhook, CancellationToken ct)
    {
        using var response = await http.GetAsync(webhook.Url, ct);
        if (IsGone(response.StatusCode))
        {
            return null;
        }
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException("Discord didn't answer the webhook lookup", null, response.StatusCode);
        }
        return await response.Content.ReadFromJsonAsync<DiscordWebhookInfo>(Json, ct)
               ?? throw new FormatException("Discord answered the webhook lookup without a body");
    }

    public async Task<WebhookPostOutcome> PostAsync(DiscordWebhook webhook, DiscordMessage message, CancellationToken ct)
    {
        try
        {
            using var response = await http.PostAsJsonAsync(webhook.Url, message, Json, ct);
            return OutcomeOf(response.StatusCode);
        }
        catch (HttpRequestException)
        {
            return WebhookPostOutcome.Failed;
        }
        catch (TaskCanceledException) when (!ct.IsCancellationRequested)
        {
            return WebhookPostOutcome.Failed;
        }
    }

    private static WebhookPostOutcome OutcomeOf(HttpStatusCode status)
    {
        if (IsGone(status))
        {
            return WebhookPostOutcome.WebhookGone;
        }
        if (status == HttpStatusCode.TooManyRequests)
        {
            return WebhookPostOutcome.RateLimited;
        }
        var isSuccess = (int)status is >= 200 and < 300;
        return isSuccess ? WebhookPostOutcome.Posted : WebhookPostOutcome.Failed;
    }

    private static bool IsGone(HttpStatusCode status) => status is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized;
}
