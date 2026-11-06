using Microsoft.Extensions.Caching.Memory;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Models;
using SkiaSharp;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Builds the link preview of a shared lineup from the same generator run the shared page shows, so the decks'
/// win rates and card versions match what the friend sees when they open it.
/// </summary>
public sealed class ShareImageService(
    PlayerProfileCache players,
    MetaCache meta,
    DeckAnalyzer analyzer,
    CardArtCache art)
{
    private static readonly TimeSpan CacheFor = TimeSpan.FromHours(6);

    // Chat apps fetch a preview once per post, so a small cache covers a link being pasted in a few places.
    private readonly MemoryCache _cache = new(new MemoryCacheOptions { SizeLimit = 64 });

    /// <summary>The JPEG, or null when the code is invalid or none of its decks can be fielded by the player.</summary>
    public async Task<byte[]?> GetAsync(string playerTag, string? shareCode, CancellationToken ct)
    {
        if (!ShareCode.TryDecode(shareCode, out var shared))
        {
            return null;
        }
        // Image URLs carry the tag without its '#', which the CR API needs.
        var tag = "#" + playerTag.TrimStart('#').ToUpperInvariant();
        var key = $"{tag}/{shareCode}";
        if (_cache.TryGetValue(key, out byte[]? cached))
        {
            return cached;
        }

        var player = await players.GetPlayerDataAsync(tag, ct);
        if (player.Cards is null)
        {
            return null;
        }
        var cardMap = new Dictionary<int, PlayerItemLevel>();
        foreach (var card in player.Cards)
        {
            cardMap[card.Id] = card.ToPlayerItemLevel();
        }

        var lineup = analyzer.ScoreLockedDecks(meta.GetMetaIndex(), cardMap, shared);

        var images = new List<SKImage?>();
        try
        {
            var decks = new List<ShareImageDeck>();
            SKImage? glow = null;
            foreach (var ids in shared)
            {
                // A locked deck the player can't field is left out of the lineup, like on the shared page.
                var scored = lineup.FirstOrDefault(d => d.CardIds.Order().SequenceEqual(ids.Order()));
                if (scored is null)
                {
                    continue;
                }
                var cards = ids.Select(id => scored.Cards.First(c => c.Id == id)).ToList();
                // At most eight downloads per preview at once; Task.WhenAll preserves the shared card order.
                var arts = await LoadArtsAsync(cards, scored.CardVersions, ct);
                images.AddRange(arts);
                var named = cards.Select(c => (c.Name ?? "", c.ElixirCost)).ToList();
                glow ??= arts[DeckArchetypes.FeaturedIndex(named)];
                decks.Add(new ShareImageDeck(
                    DeckArchetypes.Classify(named).Name,
                    scored.MetaWinRate,
                    cards.Average(c => (double)(c.ElixirCost ?? 0)),
                    arts));
            }
            if (decks.Count == 0)
            {
                return null;
            }

            var jpeg = ShareImageRenderer.Render(player.Name ?? "Shared", decks, glow);
            _cache.Set(key, jpeg, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = CacheFor });
            return jpeg;
        }
        finally
        {
            foreach (var image in images)
            {
                image?.Dispose();
            }
        }
    }

    /// <summary>Matches cardIconUrl in client/src/lib/cardDisplay.ts.</summary>
    private static string? IconUrl(PlayerItemLevel card, CardVersionKind version) => version switch
    {
        CardVersionKind.Hero => card.IconUrls?.HeroMedium ?? card.IconUrls?.EvolutionMedium ?? card.IconUrls?.Medium,
        CardVersionKind.Evo => card.IconUrls?.EvolutionMedium ?? card.IconUrls?.Medium,
        _ => card.IconUrls?.Medium,
    };

    private async Task<SKImage?> LoadArtAsync(string? url, CancellationToken ct)
    {
        if (url is null || !CardArtCache.TryParseUrl(url, out var kind, out var hash))
        {
            return null;
        }
        var path = await art.GetAsync(kind, hash, ct);
        return path is null ? null : SKImage.FromEncodedData(path);
    }

    private async Task<SKImage?[]> LoadArtsAsync(
        IReadOnlyList<PlayerItemLevel> cards, IReadOnlyList<CardVersion>? versions, CancellationToken ct)
    {
        var pending = cards.Select(card =>
        {
            var version = versions?.FirstOrDefault(v => v.CardId == card.Id)?.Version ?? CardVersionKind.Normal;
            return LoadArtAsync(IconUrl(card, version), ct);
        }).ToArray();
        try
        {
            return await Task.WhenAll(pending);
        }
        catch
        {
            // When one load fails or is cancelled, WhenAll still waits for every load. Dispose the images
            // returned by successful loads too: they haven't yet been transferred to the render's owner.
            foreach (var task in pending)
            {
                if (task.IsCompletedSuccessfully)
                {
                    task.Result?.Dispose();
                }
            }
            throw;
        }
    }
}
