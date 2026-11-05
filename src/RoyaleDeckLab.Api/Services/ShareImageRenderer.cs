using System.Globalization;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Services;

public sealed record ShareImageDeck(string Name, double WinRate, double AvgElixir, IReadOnlyList<SKImage?> Cards);

/// <summary>
/// The 1200×630 link preview of a shared lineup: a header with whose decks they are, then one row per deck
/// with its name and win rate beside its eight cards.
/// </summary>
public static class ShareImageRenderer
{
    public const int Width = 1200;
    public const int Height = 630;
    private const int JpegQuality = 88;

    private const float Margin = 44;
    private const float RowsTop = 108;
    private const float RowHeight = 118;
    private const float RowGap = 10;
    private const float CardGap = 8;
    private const float CardWidth = 80;
    private const float CardAspect = 285f / 420f;

    // Inter's ascender plus descender, which is what CSS's line-height: normal uses.
    private const float NormalLineHeight = 1.21f;

    private static readonly SKColor Background = new(0x0c, 0x0c, 0x0d);
    private static readonly SKColor Text = new(0xf4, 0xf4, 0xf5);
    private static readonly SKColor Muted = new(0xa1, 0xa1, 0xaa);
    private static readonly SKColor Gold = new(0xe8, 0xb2, 0x4a);
    private static readonly SKColor Placeholder = new(0x20, 0x20, 0x23);

    // Skia draws without Inter's GPOS kerning, which drawing letter by letter for the brand's tracking makes
    // visible as "ROY ALE". These are HarfBuzz's advances for the fixed text, in 1/2048 em; DECKLAB has none.
    private static readonly float[] RoyaleKerning = [0, -104 / 2048f, -170 / 2048f, 0, 0, 0];

    private static readonly SKTypeface Medium = LoadFont("Inter-Medium.ttf");
    private static readonly SKTypeface SemiBold = LoadFont("Inter-SemiBold.ttf");
    private static readonly SKTypeface ExtraBold = LoadFont("Inter-ExtraBold.ttf");
    private static readonly SKTypeface Black = LoadFont("Inter-Black.ttf");

    /// <summary>A JPEG, which stays under the ~300 KB WhatsApp accepts for previews where a PNG wouldn't.</summary>
    public static byte[] Render(string playerName, IReadOnlyList<ShareImageDeck> decks, SKImage? glow)
    {
        var info = new SKImageInfo(Width, Height, SKColorType.Rgba8888, SKAlphaType.Premul);
        using var surface = SKSurface.Create(info);
        var canvas = surface.Canvas;
        canvas.Clear(Background);

        if (glow is not null)
        {
            DrawGlow(canvas, glow);
        }
        DrawHeader(canvas, playerName);
        for (var i = 0; i < decks.Count; i++)
        {
            DrawRow(canvas, decks[i], i, RowsTop + i * (RowHeight + RowGap));
        }

        using var image = surface.Snapshot();
        using var jpeg = image.Encode(SKEncodedImageFormat.Jpeg, JpegQuality);
        return jpeg.ToArray();
    }

    private static void DrawGlow(SKCanvas canvas, SKImage art)
    {
        const float saturation = 1.4f;
        const float opacity = 0.55f;
        var r = 0.213f * (1 - saturation);
        var g = 0.715f * (1 - saturation);
        var b = 0.072f * (1 - saturation);
        using var paint = new SKPaint
        {
            ColorFilter = SKColorFilter.CreateColorMatrix(
            [
                r + saturation, g, b, 0, 0,
                r, g + saturation, b, 0, 0,
                r, g, b + saturation, 0, 0,
                0, 0, 0, opacity, 0,
            ]),
            ImageFilter = SKImageFilter.CreateBlur(70, 70),
        };
        const float width = 520;
        canvas.DrawImage(art, SKRect.Create(760, -260, width, width / CardAspect), new SKSamplingOptions(SKFilterMode.Linear), paint);
    }

    private static void DrawHeader(SKCanvas canvas, string playerName)
    {
        const float top = 30;
        const float height = 60;
        var right = Width - Margin;

        using var eyebrow = new SKFont(SemiBold, 20);
        using var title = new SKFont(ExtraBold, 38);
        var titleBlock = 20 * NormalLineHeight + 38 * 1.05f;
        var y = top + (height - titleBlock) / 2;
        DrawLine(canvas, "Shared war decks", eyebrow, Muted, Margin, y, 20 * NormalLineHeight);
        DrawLine(canvas, Fit($"{playerName}'s war decks", title, right - Margin - 220), title, Text,
            Margin, y + 20 * NormalLineHeight, 38 * 1.05f);

        using var brandTop = new SKFont(Black, 30 * 0.56f);
        using var brandBottom = new SKFont(Black, 30);
        using var site = new SKFont(Medium, 16);
        var brandBlock = 30 * 0.56f * 0.9f + 30 * 0.9f + 6 + 16 * NormalLineHeight;
        y = top + (height - brandBlock) / 2;
        DrawLine(canvas, "ROYALE", brandTop, Text, right, y, 30 * 0.56f * 0.9f, SKTextAlign.Right, letterSpacing: 30 * 0.56f * 0.08f, kerning: RoyaleKerning);
        y += 30 * 0.56f * 0.9f;
        DrawLine(canvas, "DECKLAB", brandBottom, Text, right, y, 30 * 0.9f, SKTextAlign.Right);
        y += 30 * 0.9f + 6;
        DrawLine(canvas, "royaledecklab.com", site, Muted, right, y, 16 * NormalLineHeight, SKTextAlign.Right);
    }

    private static void DrawRow(SKCanvas canvas, ShareImageDeck deck, int index, float top)
    {
        const int cards = 8;
        var cardsLeft = Width - Margin - (cards * CardWidth + (cards - 1) * CardGap);
        var labelWidth = cardsLeft - 32 - Margin;

        using var label = new SKFont(SemiBold, 16);
        using var name = new SKFont(SemiBold, 28);
        using var stats = new SKFont(Medium, 19);
        var block = 16 * NormalLineHeight + 28 * 1.1f + 4 + 19 * NormalLineHeight;
        var y = top + (RowHeight - block) / 2;
        DrawLine(canvas, $"Deck {index + 1}", label, Gold, Margin, y, 16 * NormalLineHeight);
        y += 16 * NormalLineHeight;
        DrawLine(canvas, Fit(deck.Name, name, labelWidth), name, Text, Margin, y, 28 * 1.1f);
        y += 28 * 1.1f + 4;
        var line = string.Create(CultureInfo.InvariantCulture,
            $"{Math.Round(deck.WinRate * 100, MidpointRounding.AwayFromZero)}% win rate · {deck.AvgElixir:0.0} elixir");
        DrawLine(canvas, Fit(line, stats, labelWidth), stats, Muted, Margin, y, 19 * NormalLineHeight);

        var sampling = new SKSamplingOptions(SKCubicResampler.Mitchell);
        for (var i = 0; i < deck.Cards.Count && i < cards; i++)
        {
            var slot = SKRect.Create(cardsLeft + i * (CardWidth + CardGap), top, CardWidth, RowHeight);
            if (deck.Cards[i] is { } art)
            {
                canvas.DrawImage(art, Contain(art, slot), sampling);
            }
            else
            {
                using var paint = new SKPaint { Color = Placeholder, IsAntialias = true };
                canvas.DrawRoundRect(Contain(285, 420, slot), 8, 8, paint);
            }
        }
    }

    /// <summary>Draws one line of text vertically centred in a CSS-style line box starting at <paramref name="top"/>.</summary>
    private static void DrawLine(
        SKCanvas canvas, string text, SKFont font, SKColor color, float x, float top, float lineHeight,
        SKTextAlign align = SKTextAlign.Left, float letterSpacing = 0, float[]? kerning = null)
    {
        var metrics = font.Metrics;
        var baseline = top + (lineHeight - (metrics.Descent - metrics.Ascent)) / 2 - metrics.Ascent;
        using var paint = new SKPaint { Color = color, IsAntialias = true };
        if (letterSpacing == 0)
        {
            canvas.DrawText(text, x, baseline, align, font, paint);
            return;
        }
        var advances = text
            .Select((c, i) => font.MeasureText(c.ToString()) + letterSpacing + (kerning?[i] ?? 0) * font.Size)
            .ToList();
        var cursor = align == SKTextAlign.Right ? x - advances.Sum() : x;
        for (var i = 0; i < text.Length; i++)
        {
            canvas.DrawText(text[i].ToString(), cursor, baseline, SKTextAlign.Left, font, paint);
            cursor += advances[i];
        }
    }

    private static string Fit(string text, SKFont font, float maxWidth)
    {
        if (font.MeasureText(text) <= maxWidth)
        {
            return text;
        }
        for (var length = text.Length - 1; length > 0; length--)
        {
            var cut = text[..length].TrimEnd() + "…";
            if (font.MeasureText(cut) <= maxWidth)
            {
                return cut;
            }
        }
        return "…";
    }

    private static SKRect Contain(SKImage art, SKRect box) => Contain(art.Width, art.Height, box);

    private static SKRect Contain(float width, float height, SKRect box)
    {
        var scale = Math.Min(box.Width / width, box.Height / height);
        var (w, h) = (width * scale, height * scale);
        return SKRect.Create(box.MidX - w / 2, box.MidY - h / 2, w, h);
    }

    private static SKTypeface LoadFont(string file)
    {
        using var stream = typeof(ShareImageRenderer).Assembly.GetManifestResourceStream($"Fonts.{file}")
            ?? throw new InvalidOperationException($"Font {file} isn't embedded");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        using var data = SKData.CreateCopy(memory.ToArray());
        return SKTypeface.FromData(data) ?? throw new InvalidOperationException($"Could not load font {file}");
    }
}
