using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class PatchController(MetaCache cache) : ControllerBase
{
    [HttpGet("api/patch")]
    [OutputCache(PolicyName = "public-json")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public IActionResult Get() => Ok(new { updates = BalanceUpdates.During(cache.CardStats) });
}
