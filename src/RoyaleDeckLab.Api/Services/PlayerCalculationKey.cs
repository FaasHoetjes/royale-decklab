using System.Security.Cryptography;
using System.Text.Json;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public static class PlayerCalculationKey
{
    public static string Create(CrPlayer player, long metaVersion, LineupOptions? options = null)
        => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new
        {
            player.Tag, Cards = player.Cards?.OrderBy(c => c.Id), metaVersion,
            options?.DeckCount, options?.MinLevel,
            Banned = options?.BannedCards.Order(), Required = options?.RequiredCards.Order(),
            // Locked deck order controls their order in the returned lineup.
            Locked = options?.LockedDecks.Select(ids => ids.Order()),
        })));
}
