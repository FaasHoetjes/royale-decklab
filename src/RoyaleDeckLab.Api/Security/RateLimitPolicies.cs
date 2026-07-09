namespace RoyaleDeckLab.Api.Security;

public static class RateLimitPolicies
{
    // Caps the endpoints that spend the CR API key on the caller's behalf (/api/player/*). Defined in Program.cs.
    public const string Player = "player";
}
