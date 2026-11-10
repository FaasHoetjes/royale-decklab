using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Reminders;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class StatsController(StatsRecorder recorder, LivePresence presence, StatsStore store, TimeProvider clock) : ControllerBase
{
    public sealed record EventBody(string? Kind, string? Tag, string? Tool, string? Ref, string? UtmSource, string? UtmCampaign);

    /// <summary>
    /// The page's pings. Only fixed kinds and tools are accepted, and a lookup or shared-lineup open only for a
    /// player the server loaded in the last half hour, so a made-up tag can't be counted. Always 204, so the
    /// answer tells nothing about what was kept.
    /// </summary>
    [HttpPost("api/stats/event")]
    [EnableRateLimiting(RateLimitPolicies.Stats)]
    [RequestSizeLimit(1024)]
    public IActionResult Event([FromBody] EventBody body)
    {
        var tag = body.Tag is { } raw && PlayerTag.IsValid(raw.TrimStart('#')) ? StatsRecorder.NormalizeTag(raw) : null;
        var origin = new VisitOrigin(body.Ref is { Length: <= 253 } host ? host : null, body.UtmSource, body.UtmCampaign);
        switch (body.Kind)
        {
            case StatsStore.Kinds.Lookup or StatsStore.Kinds.ShareOpen when tag is not null && recorder.WasServed(tag):
                recorder.Record(HttpContext, body.Kind, tag, origin: origin);
                break;
            case StatsStore.Kinds.ShareTap:
                recorder.Record(HttpContext, body.Kind, origin: origin);
                break;
            case StatsStore.Kinds.DeckCopy or StatsStore.Kinds.DeckOpen
                when body.Tool is { } exportTool && StatsClassify.DeckExportTools.Contains(exportTool):
                recorder.Record(HttpContext, body.Kind, tool: exportTool, origin: origin);
                break;
            case StatsStore.Kinds.Tool when body.Tool is { } tool && StatsClassify.Tools.Contains(tool):
                recorder.Record(HttpContext, body.Kind, tool: tool, origin: origin);
                break;
        }
        return NoContent();
    }

    [HttpGet("api/admin/stats")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.AdminStats)]
    public IActionResult Report(
        [FromQuery] string? source, [FromQuery] string? country, [FromQuery] string? device, [FromServices] ReminderStore reminders)
    {
        Response.Headers.CacheControl = "no-store";
        var filter = new StatsFilter(
            source is not null && StatsClassify.Sources.Contains(source) ? source : null,
            StatsClassify.Country(country),
            device is "phone" or "desktop" ? device : null);
        return Ok(StatsReport.Build(store, clock.GetUtcNow(), filter, presence.InView, reminders.RowCount()));
    }
}
