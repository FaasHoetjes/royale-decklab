using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class PrecompressedAssetsTests : IDisposable
{
    private readonly string root = Directory.CreateTempSubdirectory().FullName;

    public PrecompressedAssetsTests()
    {
        Directory.CreateDirectory(Path.Combine(root, "assets"));
        File.WriteAllText(Path.Combine(root, "assets", "index-abc.js"), "js");
        File.WriteAllText(Path.Combine(root, "assets", "index-abc.js.br"), "br");
        File.WriteAllText(Path.Combine(root, "assets", "plain-abc.js"), "js");
        File.WriteAllText(Path.Combine(root, "theme-init.js"), "js");
        File.WriteAllText(Path.Combine(root, "theme-init.js.br"), "br");
    }

    public void Dispose() => Directory.Delete(root, recursive: true);

    [Fact]
    public void BrowsersAcceptingBrotli_GetTheBuiltBrFile()
    {
        var ctx = Request("/assets/index-abc.js", "gzip, deflate, br");
        Assert.Equal("/assets/index-abc.js.br", ctx.Request.Path);
        Assert.Equal("br", ctx.Response.Headers.ContentEncoding);
        Assert.Equal("Accept-Encoding", ctx.Response.Headers.Vary);
    }

    [Theory]
    [InlineData("/assets/index-abc.js", "gzip")]
    [InlineData("/assets/index-abc.js", "br;q=0, gzip")]
    [InlineData("/assets/plain-abc.js", "br")]
    [InlineData("/theme-init.js", "br")]
    public void OtherRequests_AreLeftToTheStaticFiles(string path, string acceptEncoding)
    {
        var ctx = Request(path, acceptEncoding);
        Assert.Equal(path, ctx.Request.Path);
        Assert.False(ctx.Response.Headers.ContainsKey("Content-Encoding"));
    }

    private HttpContext Request(string path, string acceptEncoding)
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Method = "GET";
        ctx.Request.Path = path;
        ctx.Request.Headers.AcceptEncoding = acceptEncoding;
        using var files = new PhysicalFileProvider(root);
        SpaHosting.ServePrecompressed(ctx, files);
        return ctx;
    }
}
