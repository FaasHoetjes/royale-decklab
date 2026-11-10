using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services.Reminders;

namespace RoyaleDeckLab.Api.Controllers;

public sealed record ReminderRequest(string WebhookUrl, ReminderSettings Settings);

public sealed record WebhookRequest(string WebhookUrl);

public sealed record SavedReminder(string? WebhookName);

public sealed record ReminderProblemResponse(ReminderProblem Code);

public sealed record ReminderAvailability(bool IsAvailable);

/// <summary>A clan's Discord war reminders. The webhook URL is a secret, so it only ever travels in a request body.</summary>
[ApiController]
[Route("api/clans/{tag}/discord-reminders")]
public sealed class DiscordRemindersController(DiscordReminderSetup setup) : ControllerBase
{
    private const int MaxBodyBytes = 4_096;

    [HttpGet]
    [EnableRateLimiting(RateLimitPolicies.Clan)]
    public ActionResult<ReminderAvailability> Get(string tag)
    {
        if (!ClanTag.TryParse(tag, out _))
        {
            return BadRequest();
        }
        return new ReminderAvailability(setup.IsAvailable);
    }

    [HttpPost("lookup")]
    [EnableRateLimiting(RateLimitPolicies.Reminders)]
    [RequestSizeLimit(MaxBodyBytes)]
    public ActionResult<ReminderSettings> Lookup(string tag, WebhookRequest request)
    {
        if (!ClanTag.TryParse(tag, out var clan))
        {
            return BadRequest();
        }

        return setup.Find(clan, request.WebhookUrl) switch
        {
            ReminderLookup.Found found => found.Settings,
            ReminderLookup.Refused refused => Problem(refused.Problem),
            _ => throw new InvalidOperationException("Unknown lookup result"),
        };
    }

    [HttpPut]
    [EnableRateLimiting(RateLimitPolicies.ReminderSave)]
    [RequestSizeLimit(MaxBodyBytes)]
    public async Task<ActionResult<SavedReminder>> Put(string tag, ReminderRequest request, CancellationToken ct)
    {
        if (!ClanTag.TryParse(tag, out var clan))
        {
            return BadRequest();
        }

        var result = await setup.SaveAsync(clan, request.WebhookUrl, request.Settings, ct);
        return result switch
        {
            ReminderSetupResult.Saved saved => new SavedReminder(saved.WebhookName),
            ReminderSetupResult.Refused refused => Problem(refused.Problem),
            _ => throw new InvalidOperationException($"Unknown setup result {result.GetType().Name}"),
        };
    }

    [HttpPost("test")]
    [EnableRateLimiting(RateLimitPolicies.ReminderTest)]
    [RequestSizeLimit(MaxBodyBytes)]
    public async Task<IActionResult> Test(string tag, ReminderRequest request, CancellationToken ct)
    {
        if (!ClanTag.TryParse(tag, out var clan))
        {
            return BadRequest();
        }

        var problem = await setup.TestAsync(clan, request.WebhookUrl, request.Settings, ct);
        return problem is { } refused ? Problem(refused) : NoContent();
    }

    [HttpDelete]
    [EnableRateLimiting(RateLimitPolicies.Reminders)]
    [RequestSizeLimit(MaxBodyBytes)]
    public IActionResult Delete(string tag, WebhookRequest request)
    {
        if (!ClanTag.TryParse(tag, out var clan))
        {
            return BadRequest();
        }

        var problem = setup.Delete(clan, request.WebhookUrl);
        return problem is { } refused ? Problem(refused) : NoContent();
    }

    private ObjectResult Problem(ReminderProblem problem)
        => StatusCode(StatusOf(problem), new ReminderProblemResponse(problem));

    private static int StatusOf(ReminderProblem problem) => problem switch
    {
        ReminderProblem.Unavailable => StatusCodes.Status503ServiceUnavailable,
        ReminderProblem.InvalidWebhook => StatusCodes.Status400BadRequest,
        ReminderProblem.InvalidSettings => StatusCodes.Status400BadRequest,
        ReminderProblem.ClanNotFound => StatusCodes.Status404NotFound,
        ReminderProblem.NotRegistered => StatusCodes.Status404NotFound,
        ReminderProblem.NoResetTime => StatusCodes.Status422UnprocessableEntity,
        ReminderProblem.WebhookNotFound => StatusCodes.Status422UnprocessableEntity,
        ReminderProblem.TooManyReminders => StatusCodes.Status409Conflict,
        ReminderProblem.TooManyForServer => StatusCodes.Status409Conflict,
        ReminderProblem.DiscordFailed => StatusCodes.Status502BadGateway,
        ReminderProblem.ClashRoyaleFailed => StatusCodes.Status502BadGateway,
        ReminderProblem.Busy => StatusCodes.Status503ServiceUnavailable,
        _ => StatusCodes.Status500InternalServerError,
    };
}
