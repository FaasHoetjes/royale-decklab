using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// The CR API doesn't say which cards are boosted, but a battle log lists the level each card was played at and a
/// profile the level it's upgraded to. A card played above its owner's level was boosted. Card Boost Potions boost
/// single cards for a few hours too, so a card counts as season-boosted only when nearly every player using it below
/// King Tower level had it boosted.
/// </summary>
public static class SeasonBoostDetection
{
    public const double MinBoostedShare = 0.9;
    public const int MinPlayers = 5;

    // The boosted cards can change during a season (Nov 9, 2026 added three), so old battles would vouch for a stale set.
    public static readonly TimeSpan Window = TimeSpan.FromDays(3);

    private const string WarBattleMode = "CW_Battle_1v1";

    // Modes played at the player's own card levels; events and friendlies can set levels of their own.
    private static readonly HashSet<string> OwnLevelBattleTypes = new(StringComparer.Ordinal)
    {
        "PvP",
        "pathOfLegend",
        "riverRaceDuel",
        "riverRaceDuelColosseum",
    };

    public sealed record Sample(CrPlayer Player, IReadOnlyList<CrBattle> Battles);

    public static IReadOnlySet<int> BoostedCards(IEnumerable<Sample> samples, DateTimeOffset now)
    {
        var cutoffMs = (now - Window).ToUnixTimeMilliseconds();
        var tallies = new Dictionary<int, Tally>();
        foreach (var sample in samples)
        {
            foreach (var (cardId, wasBoosted) in LatestUsesBelowKingLevel(sample, cutoffMs))
            {
                if (!tallies.TryGetValue(cardId, out var tally))
                {
                    tally = new Tally();
                    tallies[cardId] = tally;
                }
                tally.Players++;
                if (wasBoosted)
                {
                    tally.Boosted++;
                }
            }
        }

        return tallies
            .Where(t => t.Value.Players >= MinPlayers)
            .Where(t => (double)t.Value.Boosted / t.Value.Players >= MinBoostedShare)
            .Select(t => t.Key)
            .ToHashSet();
    }

    /// <summary>
    /// Whether each card the player owns below King Tower level was boosted the last time they played it, so a card
    /// that joined or left the boosted set within the window is judged by its current state.
    /// </summary>
    private static Dictionary<int, bool> LatestUsesBelowKingLevel(Sample sample, long cutoffMs)
    {
        var latest = new Dictionary<int, bool>();
        var kingLevel = sample.Player.KingTowerLevel;
        if (kingLevel < SeasonBoosts.MinKingTowerLevel || sample.Player.Cards is null)
        {
            return latest;
        }

        var ownedLevels = new Dictionary<int, int>();
        foreach (var card in sample.Player.Cards)
        {
            ownedLevels[card.Id] = LevelModel.DisplayLevel(card.Level, card.MaxLevel);
        }

        var recentBattles = sample.Battles
            .Where(IsPlayedAtOwnLevels)
            .Select(b => (Battle: b, TimeMs: BattleRepository.ParseBattleTime(b.BattleTime)))
            .Where(b => b.TimeMs >= cutoffMs)
            .OrderByDescending(b => b.TimeMs)
            .Select(b => b.Battle);
        foreach (var battle in recentBattles)
        {
            var side = battle.Team?.FirstOrDefault(s => string.Equals(s.Tag, sample.Player.Tag, StringComparison.Ordinal));
            foreach (var card in side?.Cards ?? [])
            {
                var isBelowKingLevel = ownedLevels.TryGetValue(card.Id, out var owned) && owned < kingLevel;
                if (!isBelowKingLevel)
                {
                    continue;
                }
                latest.TryAdd(card.Id, LevelModel.DisplayLevel(card.Level, card.MaxLevel) > owned);
            }
        }
        return latest;
    }

    private static bool IsPlayedAtOwnLevels(CrBattle battle)
    {
        if (battle.Type == "riverRacePvP")
        {
            return battle.GameMode?.Name == WarBattleMode;
        }
        return OwnLevelBattleTypes.Contains(battle.Type);
    }

    private sealed class Tally
    {
        public int Players;
        public int Boosted;
    }
}
