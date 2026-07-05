namespace RoyaleDeckLab.Api.Security;

/// <summary>Named rate-limit policies shared between Program.cs and the controllers.</summary>
public static class RateLimitPolicies
{
    /// <summary>
    /// Per-client-IP cap on the endpoints that spend the CR API key on the
    /// caller's behalf (/api/player/*). Defined in Program.cs.
    /// </summary>
    public const string Player = "player";
}
