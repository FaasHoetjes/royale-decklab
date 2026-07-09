namespace RoyaleDeckLab.Api.Security;

public static class RateLimitPolicies
{
    // Caps the endpoints that spend the CR API key on the caller's behalf (/api/player/*). Defined in Program.cs.
    public const string Player = "player";

    // Strict cap on the [RequireAdminToken] endpoints so ADMIN_TOKEN can't be brute-forced. Defined in Program.cs.
    public const string Admin = "admin";
}
