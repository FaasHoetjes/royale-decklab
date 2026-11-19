using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public static class LadderBattles
{
    private const string TrophyRoadType = "PvP";
    private const string TrophyRoadMode = "Ladder";
    private const string RankedType = "pathOfLegend";

    /// <summary>Both players' sides of a 1v1 Trophy Road or Ranked battle; none for any other battle.</summary>
    public static IReadOnlyList<LadderBattle> From(CrBattle battle)
    {
        if (ModeOf(battle) is not { } mode)
        {
            return [];
        }
        if (battle.Team is not [{ Tag: { Length: > 0 } } team] || battle.Opponent is not [{ Tag: { Length: > 0 } } opponent])
        {
            return [];
        }

        var timeMs = BattleRepository.ParseBattleTime(battle.BattleTime);
        if (timeMs == 0
            || Side(battle, mode, timeMs, team, opponent) is not { } teamSide
            || Side(battle, mode, timeMs, opponent, team) is not { } opponentSide)
        {
            return [];
        }
        return [teamSide, opponentSide];
    }

    private static LadderMode? ModeOf(CrBattle battle) => battle.Type switch
    {
        TrophyRoadType when battle.GameMode?.Name == TrophyRoadMode => LadderMode.TrophyRoad,
        RankedType => LadderMode.Ranked,
        _ => null,
    };

    private static CrownSeriesCard? TowerTroop(IReadOnlyList<CrBattleCard>? supportCards)
        => supportCards is [{ Level: int level, MaxLevel: int maxLevel } troop, ..]
            ? new CrownSeriesCard(troop.Id, LevelModel.DisplayLevel(level, maxLevel), CardVersionKind.Normal)
            : null;

    private static LadderBattle? Side(CrBattle battle, LadderMode mode, long timeMs, CrBattleSide player, CrBattleSide opponent)
    {
        var standing = mode == LadderMode.TrophyRoad ? player.StartingTrophies : battle.LeagueNumber;
        if (standing is not { } value || PlayedCards.From(player.Cards) is not { } cards)
        {
            return null;
        }
        return new LadderBattle
        {
            PlayerTag = player.Tag!,
            OpponentTag = opponent.Tag!,
            BattleTimeMs = timeMs,
            Mode = mode,
            Standing = value,
            Result = BattleResultExtensions.FromCrowns(player.Crowns, opponent.Crowns),
            Crowns = player.Crowns,
            OpponentCrowns = opponent.Crowns,
            Cards = cards,
            TowerTroop = TowerTroop(player.SupportCards),
        };
    }
}
