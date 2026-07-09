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
        var expected = Environment.GetEnvironmentVariable(EnvVar);
        if (string.IsNullOrWhiteSpace(expected))
        {
            context.Result = new ObjectResult(new { error = "Admin endpoints are disabled: ADMIN_TOKEN is not configured" })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            };
            return;
        }

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!TokensMatch(provided, expected))
        {
            context.Result = new UnauthorizedObjectResult(new { error = $"Missing or invalid {HeaderName} header" });
        }
    }

    // Constant-time comparison so the token can't be probed byte-by-byte via timing.
    public static bool TokensMatch(string provided, string expected)
        => provided.Length > 0
           && CryptographicOperations.FixedTimeEquals(
               Encoding.UTF8.GetBytes(provided),
               Encoding.UTF8.GetBytes(expected));
}
