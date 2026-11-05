using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Stats;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class StatsController(StatsRecorder recorder, StatsStore store, TimeProvider clock) : ControllerBase
{
    public sealed record EventBody(string? Kind, string? Tag, string? Tool, string? Ref);

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
        var referrer = body.Ref is { Length: <= 253 } host ? host : null;
        switch (body.Kind)
        {
            case StatsStore.Kinds.Lookup or StatsStore.Kinds.ShareOpen when tag is not null && recorder.WasServed(tag):
                recorder.Record(HttpContext, body.Kind, tag, referrerHost: referrer);
                break;
            case StatsStore.Kinds.ShareTap:
                recorder.Record(HttpContext, body.Kind, referrerHost: referrer);
                break;
            case StatsStore.Kinds.Tool when body.Tool is { } tool && StatsClassify.Tools.Contains(tool):
                recorder.Record(HttpContext, body.Kind, tool: tool, referrerHost: referrer);
                break;
        }
        return NoContent();
    }

    [HttpGet("api/admin/stats")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.Admin)]
    public IActionResult Report()
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(StatsReport.Build(store, clock.GetUtcNow()));
    }
}
