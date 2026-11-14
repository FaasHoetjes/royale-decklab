using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.OutputCaching;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class PatchController(MetaCache cache, CardCatalog catalog, BalanceUpdateStore balanceUpdates) : ControllerBase
{
    [HttpGet("api/patch")]
    [OutputCache(PolicyName = "public-json")]
    [RequireMetaLoaded]
    [ResponseCache(Duration = 300, Location = ResponseCacheLocation.Any)]
    public async Task<IActionResult> Get(CancellationToken ct)
        => Ok(new { updates = balanceUpdates.During(cache.CardStats, await catalog.GetAsync(ct)) });
}
