using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace RoyaleDeckLab.Api.Security;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequireAdminTokenAttribute : Attribute, IAuthorizationFilter
{
    public const string HeaderName = "X-Admin-Token";
    public const string EnvVar = "ADMIN_TOKEN";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        // Unset and wrong look identical from outside, so the endpoints don't reveal whether they're enabled.
        var expected = Environment.GetEnvironmentVariable(EnvVar);
        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (string.IsNullOrWhiteSpace(expected) || !TokensMatch(provided, expected))
        {
            context.Result = new UnauthorizedObjectResult(new { error = $"Missing or invalid {HeaderName} header" });
        }
    }

    // Hashing first gives both sides the same length, so FixedTimeEquals doesn't return early on a length mismatch.
    public static bool TokensMatch(string provided, string expected)
        => provided.Length > 0
           && CryptographicOperations.FixedTimeEquals(
               SHA256.HashData(Encoding.UTF8.GetBytes(provided)),
               SHA256.HashData(Encoding.UTF8.GetBytes(expected)));
}
