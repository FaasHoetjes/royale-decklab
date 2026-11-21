using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

/// <param name="Group">The range the decks came from: the player's own, or the nearest one with decks.</param>
/// <param name="Ranges">Every range of the mode with the battles collected there, lowest first.</param>
public sealed record LadderDeckResult(
    WarDeckResult Lineup,
    LadderGroup PlayerGroup,
    LadderGroup Group,
    LadderRangeMeta Range,
    IReadOnlyList<LadderRangeBattles> Ranges,
    PlayerSeasonBoosts SeasonBoosts);

public sealed record LadderRangeBattles(int Floor, int Battles);

public sealed class LadderDeckCache(
    DeckAnalyzer analyzer,
    CalculationScheduler scheduler,
    LadderMeta meta,
    SeasonBoostStore seasonBoosts,
    IOptions<LadderOptions> options,
    TimeProvider clock)
{
    private static readonly LineupOptions OneDeck = new() { DeckCount = 1 };

    private readonly CalculationCache<WarDeckResult> _results = new(clock);

    /// <returns>Null when no range of the mode has decks yet.</returns>
    public async Task<LadderDeckResult?> GetAsync(CrPlayer player, LadderMode mode, CancellationToken ct = default)
    {
        var current = meta.Current;
        var playerGroup = GroupOf(player, mode, options.Value);
        if (current.For(playerGroup) is not { } found)
        {
            return null;
        }
        var (group, range) = found;
        var cards = player.Cards!.Select(c => c.ToPlayerItemLevel()).ToCardMap();
        var boosts = seasonBoosts.Current.For(cards, player.KingTowerLevel);
        var key = $"{group.Key}|{PlayerCalculationKey.Create(player, current.Version, OneDeck, boosts)}";
        var lineup = await _results.GetAsync(key,
            () => scheduler.RunAsync(token => analyzer.FindBestLadderDeck(range.Decks, boosts.ApplyTo(cards), range.OpponentLevel, token)), ct);
        var ranges = current.ByGroup
            .Where(g => g.Key.Mode == mode)
            .OrderBy(g => g.Key.Floor)
            // Each battle within a range is stored once per player side.
            .Select(g => new LadderRangeBattles(g.Key.Floor, g.Value.Sides / 2))
            .ToList();
        return new LadderDeckResult(lineup, playerGroup, group, range, ranges, boosts);
    }

    /// <summary>
    /// The player's Trophy Road range, at least the lowest one followed, or their Ranked league this season, last
    /// season's before they've played one.
    /// </summary>
    public static LadderGroup GroupOf(CrPlayer player, LadderMode mode, LadderOptions options)
    {
        var standing = mode == LadderMode.TrophyRoad
            ? Math.Max(player.Trophies, options.MinTrophies)
            : player.CurrentPathOfLegendSeasonResult?.LeagueNumber ?? player.LastPathOfLegendSeasonResult?.LeagueNumber ?? 1;
        return LadderGroup.Of(mode, standing, options)!.Value;
    }
}
