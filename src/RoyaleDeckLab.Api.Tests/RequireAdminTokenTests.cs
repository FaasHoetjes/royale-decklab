using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Abstractions;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Routing;
using RoyaleDeckLab.Api.Security;

namespace RoyaleDeckLab.Api.Tests;

public sealed class RequireAdminTokenTests
{
    private static AuthorizationFilterContext Run(string? envToken, string? header)
    {
        var previous = Environment.GetEnvironmentVariable(RequireAdminTokenAttribute.EnvVar);
        try
        {
            Environment.SetEnvironmentVariable(RequireAdminTokenAttribute.EnvVar, envToken);

            var http = new DefaultHttpContext();
            if (header is not null)
            {
                http.Request.Headers[RequireAdminTokenAttribute.HeaderName] = header;
            }

            var context = new AuthorizationFilterContext(
                new ActionContext(http, new RouteData(), new ActionDescriptor()),
                new List<IFilterMetadata>());
            new RequireAdminTokenAttribute().OnAuthorization(context);
            return context;
        }
        finally
        {
            Environment.SetEnvironmentVariable(RequireAdminTokenAttribute.EnvVar, previous);
        }
    }

    [Fact]
    public void NoTokenConfigured_RejectsLikeAWrongToken()
    {
        var unset = Run(envToken: null, header: "anything");
        var wrong = Run(envToken: "s3cret", header: "not-the-token");

        var unsetResult = Assert.IsType<UnauthorizedObjectResult>(unset.Result);
        var wrongResult = Assert.IsType<UnauthorizedObjectResult>(wrong.Result);
        Assert.Equal(wrongResult.StatusCode, unsetResult.StatusCode);
        Assert.Equal(JsonSerializer.Serialize(wrongResult.Value), JsonSerializer.Serialize(unsetResult.Value));
    }

    [Fact]
    public void MissingHeader_Returns401()
    {
        var context = Run(envToken: "s3cret", header: null);

        Assert.IsType<UnauthorizedObjectResult>(context.Result);
    }

    [Fact]
    public void WrongToken_Returns401()
    {
        var context = Run(envToken: "s3cret", header: "not-the-token");

        Assert.IsType<UnauthorizedObjectResult>(context.Result);
    }

    [Fact]
    public void CorrectToken_PassesThrough()
    {
        var context = Run(envToken: "s3cret", header: "s3cret");

        Assert.Null(context.Result);
    }

    [Theory]
    [InlineData("", "s3cret", false)]       // empty header never matches
    [InlineData("s3cret", "s3cret", true)]
    [InlineData("s3cre", "s3cret", false)]  // prefix / length mismatch
    [InlineData("S3CRET", "s3cret", false)] // case-sensitive
    [InlineData("s3cret-extra", "s3cret", false)] // longer than expected
    public void TokensMatch_ComparesExactly(string provided, string expected, bool match)
    {
        Assert.Equal(match, RequireAdminTokenAttribute.TokensMatch(provided, expected));
    }
}
