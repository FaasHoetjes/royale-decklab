using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class DuelLevelsController(DuelLevelFitRepository fits, IOptions<MetaOptions> meta) : ControllerBase
{
    private const int RefitsShown = 12;

    public sealed record Values(double PerLevel, double WeakestCard, double Evo, double Hero, double PriorRounds);

    public sealed record Report(Values InUse, IReadOnlyList<StoredDuelLevelFits> Refits);

    [HttpGet("api/admin/duel-levels")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.AdminStats)]
    public IActionResult Get()
    {
        Response.Headers.CacheControl = "no-store";
        var inUse = new Values(
            CrownSeriesLevels.Fit.PerLevel, CrownSeriesLevels.Fit.WeakestCard, CrownSeriesLevels.Specials.Evo, CrownSeriesLevels.Specials.Hero,
            meta.Value.PriorGames);
        return Ok(new Report(inUse, fits.History(RefitsShown)));
    }
}
