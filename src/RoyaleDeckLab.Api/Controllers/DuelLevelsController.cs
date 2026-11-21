using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Security;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

[ApiController]
public sealed class DuelLevelsController(
    DuelLevelFitRepository fits, DuelValuesStore duelValues, IOptions<CrownSeriesOptions> options) : ControllerBase
{
    private const int RefitsShown = 12;

    /// <param name="AppliedAtMs">When scoring switched to these values; 0 while they are still the defaults.</param>
    public sealed record Values(double PerLevel, double WeakestCard, double Evo, double Hero, double PriorRounds, long AppliedAtMs);

    public sealed record Applying(bool Levels, bool Cushion);

    public sealed record Report(Values InUse, Applying Applying, IReadOnlyList<StoredDuelLevelFits> Refits);

    [HttpGet("api/admin/duel-levels")]
    [RequireAdminToken]
    [EnableRateLimiting(RateLimitPolicies.AdminStats)]
    public IActionResult Get()
    {
        Response.Headers.CacheControl = "no-store";
        var applied = duelValues.Current;
        var v = applied.Values;
        var inUse = new Values(
            v.Levels.PerLevel, v.Levels.WeakestCard, v.Specials.Evo, v.Specials.Hero, v.PriorRounds, applied.AppliedAtMs);
        var applying = new Applying(options.Value.ApplyLevelRefits, options.Value.ApplyCushionRefits);
        return Ok(new Report(inUse, applying, fits.History(RefitsShown)));
    }
}
