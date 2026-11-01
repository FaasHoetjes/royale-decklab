using System.Runtime.CompilerServices;
using System.Text.Json;
using RoyaleDeckLab.Api.Services;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Tests;

public sealed class ShareImageTests
{
    // Codes made by encodeShare in client/src/lib/shareLink.ts.
    [Fact]
    public void ShareCode_DecodesTheClientsCodesInOrder()
    {
        Assert.True(ShareCode.TryDecode("000a0uc6cao9oaof.0o181e1p252co7ob", out var decks));
        Assert.Equal([26000000, 26000010, 26000030, 27000006, 27000010, 28000009, 28000010, 28000015], decks[0]);
        Assert.Equal([26000024, 26000044, 26000050, 26000061, 26000077, 26000084, 28000007, 28000011], decks[1]);

        Assert.True(ShareCode.TryDecode("nzo00102030405zz", out var edges));
        Assert.Equal([27000431, 28000000, 26000001, 26000002, 26000003, 26000004, 26000005, 28000431], edges[0]);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("000a0uc6cao9oao")]
    [InlineData("000A0UC6CAO9OAOF")]
    [InlineData("000a0uc6cao9oaof.000a0uc6cao9oaof")]
    [InlineData("0000000000000000")]
    [InlineData("000a0uc6cao9oa--")]
    [InlineData("0102030405060708.090a0b0c0d0e0f0g.0h0i0j0k0l0m0n0o.0p0q0r0s0t0u0v0w.0x0y0z101112131415")]
    public void ShareCode_RejectsAnythingTheClientWouldnt(string? code)
        => Assert.False(ShareCode.TryDecode(code, out _));

    [Fact]
    public void DeckArchetypes_NameDecksLikeTheClient()
    {
        using var fixture = JsonDocument.Parse(File.ReadAllText(FixturePath()));
        Assert.NotEmpty(fixture.RootElement.EnumerateArray());
        foreach (var deck in fixture.RootElement.EnumerateArray())
        {
            var cards = deck.GetProperty("cards").EnumerateArray()
                .Select(c => (c[0].GetString()!, (int?)c[1].GetInt32()))
                .ToList();
            Assert.Equal(deck.GetProperty("name").GetString(), DeckArchetypes.Classify(cards).Name);
            Assert.Equal(deck.GetProperty("featured").GetString(), cards[DeckArchetypes.FeaturedIndex(cards)].Item1);
        }
    }

    [Fact]
    public void Renderer_DrawsAPreviewSmallEnoughForWhatsApp()
    {
        using var art = CardArt(new SKColor(0x7a, 0x4c, 0xd8));
        var decks = Enumerable.Range(0, 4)
            .Select(i => new ShareImageDeck("Royal Giant Fisherman With A Very Long Name", 0.724, 3.8, [art, null, art, art, art, art, art, art]))
            .ToList();

        var jpeg = ShareImageRenderer.Render("Faas", decks, art);

        using var decoded = SKBitmap.Decode(jpeg);
        Assert.Equal((1200, 630), (decoded.Width, decoded.Height));
        Assert.InRange(jpeg.Length, 10_000, 300_000);
    }

    private static SKImage CardArt(SKColor color)
    {
        using var surface = SKSurface.Create(new SKImageInfo(285, 420));
        surface.Canvas.Clear(color);
        return surface.Snapshot();
    }

    private static string FixturePath([CallerFilePath] string thisFile = "")
        => Path.Combine(Path.GetDirectoryName(thisFile)!, "Fixtures", "deck-names.json");
}
