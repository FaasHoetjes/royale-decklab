using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Controllers;

/// <summary>
/// Answers 503 while the meta is still loading after a restart. An empty answer instead would be cached
/// by browsers for minutes and keep showing "no cards" or "no decks" after the meta is back.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequireMetaLoadedAttribute : Attribute, IResourceFilter
{
    public const int RetryAfterSeconds = 15;

    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        if (context.HttpContext.RequestServices.GetRequiredService<MetaCache>().IsLoaded)
        {
            return;
        }

        var headers = context.HttpContext.Response.Headers;
        headers.CacheControl = "no-store";
        headers.RetryAfter = RetryAfterSeconds.ToString();
        context.Result = new ObjectResult(new { error = "The meta is still loading, try again in a minute", code = "meta_loading" })
        {
            StatusCode = StatusCodes.Status503ServiceUnavailable,
        };
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}
