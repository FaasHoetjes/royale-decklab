using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

/// <summary>
/// Concise fixture builders. Every field has a sensible default so a test only
/// spells out the property it's actually exercising.
/// </summary>
internal static class Build
{
    /// <summary>A player card, maxed (level == maxLevel, no evo) unless overridden.</summary>
    public static PlayerItemLevel Card(
        int id, int level = 14, int maxLevel = 14, int evo = 0, Rarity rarity = Rarity.Common)
        => new()
        {
            Id = id,
            Name = $"Card{id}",
            Level = level,
            MaxLevel = maxLevel,
            EvolutionLevel = evo,
            Rarity = rarity,
        };

    /// <summary>A collection of maxed common cards for the given ids.</summary>
    public static List<PlayerItemLevel> Collection(params int[] ids)
        => ids.Select(id => Card(id)).ToList();

    public static Dictionary<int, PlayerItemLevel> CardMap(IEnumerable<PlayerItemLevel> cards)
        => cards.ToDictionary(c => c.Id);

    public static DeckMeta Deck(
        int[] cardIds,
        double winRate = 0.60,
        double confidence = 0.55,
        int uses = 100,
        int? players = 20,
        double? pickRate = 0.10,
        IReadOnlyList<CardVersion>? versions = null)
        => new()
        {
            CardIds = cardIds,
            WinRate = winRate,
            Confidence = confidence,
            Uses = uses,
            Players = players,
            PickRate = pickRate,
            CardVersions = versions,
        };

    /// <summary>Eight consecutive card ids starting at <paramref name="start"/> (a distinct deck per start).</summary>
    public static int[] Eight(int start) => Enumerable.Range(start, 8).ToArray();

    public static CatalogCard CatalogEntry(int id, string rarity = "common")
        => new(id, $"Card{id}", MaxLevel: 14, MaxEvolutionLevel: null, ElixirCost: 3, Rarity: rarity, IconUrls: null);

    /// <summary>Catalog map for the given ids; <paramref name="championId"/> is tagged rarity "champion".</summary>
    public static Dictionary<int, CatalogCard> CatalogMap(IEnumerable<int> ids, int? championId = null)
        => ids.ToDictionary(id => id, id => CatalogEntry(id, id == championId ? "champion" : "common"));

    public static BattleRecord Battle(
        string tag,
        int[] cardIds,
        BattleResult result,
        string battleTime = "20260101T120000.000Z",
        IReadOnlyList<CardVersion>? versions = null)
        => new()
        {
            Key = $"{tag}|{battleTime}|{string.Join('-', cardIds)}|{result}",
            BattleTime = battleTime,
            PlayerTag = tag,
            CardIds = cardIds,
            Result = result,
            CardVersions = versions ?? cardIds.Select(id => new CardVersion(id, CardVersionKind.Normal)).ToList(),
        };
}
