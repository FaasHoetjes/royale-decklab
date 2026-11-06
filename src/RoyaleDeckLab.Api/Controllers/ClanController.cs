using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class ClanController(ClanWarCache clanWars, ClanSearchCache clanSearch) : ControllerBase
{
    private const int MaxNameLength = 50;

    [HttpGet("api/clans")]
    [EnableRateLimiting(RateLimitPolicies.ClanSearch)]
    public async Task<ActionResult<IReadOnlyList<ClanSummary>>> Search([FromQuery] string? name, CancellationToken ct)
    {
        var query = name?.Trim() ?? "";
        if (query.Length < ClanSummary.MinNameLength || query.Length > MaxNameLength)
        {
            return BadRequest();
        }

        try
        {
            return Ok(await clanSearch.SearchAsync(query, ct));
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.BadRequest)
        {
            return BadRequest();
        }
    }

    [HttpGet("api/clans/{tag}/war")]
    [EnableRateLimiting(RateLimitPolicies.Clan)]
    public async Task<ActionResult<ClanWar>> War(string tag, CancellationToken ct)
    {
        if (!ClanTag.TryParse(tag, out var clanTag))
        {
            return BadRequest();
        }

        try
        {
            return await clanWars.GetAsync(clanTag, ct);
        }
        catch (HttpRequestException ex) when (ex.StatusCode == HttpStatusCode.NotFound)
        {
            return NotFound();
        }
    }
}
