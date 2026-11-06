using System.Net;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
[EnableRateLimiting(RateLimitPolicies.Clan)]
public sealed class ClanController(ClanWarCache clanWars) : ControllerBase
{
    [HttpGet("api/clans/{tag}/war")]
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
