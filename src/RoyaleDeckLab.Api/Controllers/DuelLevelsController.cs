using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class DuelLevelsController(DuelLevelFitRepository fits) : ControllerBase
{
    private const int RefitsShown = 12;

    public sealed record Values(double PerLevel, double WeakestCard, double Evo, double Hero);

    public sealed record Report(Values InUse, IReadOnlyList<StoredDuelLevelFits> Refits);

    [HttpGet("api/admin/duel-levels")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.AdminStats)]
    public IActionResult Get()
    {
        Response.Headers.CacheControl = "no-store";
        var inUse = new Values(
            CrownSeriesLevels.Fit.PerLevel, CrownSeriesLevels.Fit.WeakestCard, CrownSeriesLevels.Specials.Evo, CrownSeriesLevels.Specials.Hero);
        return Ok(new Report(inUse, fits.History(RefitsShown)));
    }
}
