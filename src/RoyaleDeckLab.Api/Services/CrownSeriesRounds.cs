using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Reads the rounds of a Crown Series Duel out of a battle log entry.</summary>
public static class CrownSeriesRounds
{
    // The API reports these Duels with battle type "unknown", so the game mode is what identifies them.
    private const string GameModeName = "Competitive_Multideck";

    private const string MultiDeckSelection = "quadDeckPick";

    public static bool IsCrownSeries(CrBattle battle) => battle.GameMode?.Name == GameModeName;

    /// <summary>A battle played with a multi-deck lineup that isn't a Crown Series Duel, such as a mode Supercell added later.</summary>
    public static bool IsOtherMultiDeckBattle(CrBattle battle)
        => battle.DeckSelection == MultiDeckSelection && !IsCrownSeries(battle);

    /// <summary>Both players' decks for every round, or none when the battle isn't a complete Crown Series Duel.</summary>
    public static IReadOnlyList<CrownSeriesRound> From(CrBattle battle)
    {
        if (!IsCrownSeries(battle))
        {
            return [];
        }
        if (battle is not { LeagueNumber: int league, EventTag: { Length: > 0 } eventTag, GameMode.Id: int gameModeId })
        {
            return [];
        }
        if (battle.Team?.FirstOrDefault() is not { Tag: { Length: > 0 } teamTag } team)
        {
            return [];
        }
        if (battle.Opponent?.FirstOrDefault() is not { Tag: { Length: > 0 } opponentTag } opponent)
        {
            return [];
        }

        var match = new Match(
            MatchKey(battle.BattleTime, teamTag, opponentTag),
            battle.BattleTime,
            BattleRepository.ParseBattleTime(battle.BattleTime),
            league,
            eventTag,
            gameModeId);
        var teamRounds = team.Rounds ?? [];
        var opponentRounds = opponent.Rounds ?? [];
        var roundCount = Math.Min(teamRounds.Count, opponentRounds.Count);

        var rounds = new List<CrownSeriesRound>(roundCount * 2);
        for (var r = 0; r < roundCount; r++)
        {
            var teamRound = ToRound(match, teamTag, r, teamRounds[r], opponentRounds[r].Crowns);
            var opponentRound = ToRound(match, opponentTag, r, opponentRounds[r], teamRounds[r].Crowns);
            if (teamRound is null || opponentRound is null)
            {
                return [];
            }
            rounds.Add(teamRound);
            rounds.Add(opponentRound);
        }
        return rounds;
    }

    private sealed record Match(string Key, string BattleTime, long BattleTimeMs, int League, string EventTag, int GameModeId);

    private static string MatchKey(string battleTime, string tag, string otherTag)
    {
        var isTagFirst = string.CompareOrdinal(tag, otherTag) <= 0;
        return isTagFirst
            ? $"{battleTime}|{tag}|{otherTag}"
            : $"{battleTime}|{otherTag}|{tag}";
    }

    private static CrownSeriesRound? ToRound(Match match, string playerTag, int round, CrBattleRound played, int opponentCrowns)
    {
        var cards = played.Cards ?? [];
        if (cards.Count == 0)
        {
            return null;
        }

        var levels = new List<CardLevel>(cards.Count);
        foreach (var card in cards)
        {
            if (card is not { Level: int level, MaxLevel: int maxLevel })
            {
                return null;
            }
            levels.Add(new CardLevel(card.Id, LevelModel.DisplayLevel(level, maxLevel)));
        }

        return new CrownSeriesRound
        {
            Key = $"{playerTag}|{match.BattleTime}|r{round}",
            MatchKey = match.Key,
            PlayerTag = playerTag,
            BattleTime = match.BattleTime,
            BattleTimeMs = match.BattleTimeMs,
            Round = round,
            Result = BattleResultExtensions.FromCrowns(played.Crowns, opponentCrowns),
            CardIds = cards
                .Select(c => c.Id)
                .Order()
                .ToArray(),
            CardLevels = levels
                .OrderBy(c => c.CardId)
                .ToList(),
            CardVersions = cards
                .Select(c => new CardVersion(c.Id, MetaBuilder.FieldedVersion(c)))
                .ToList(),
            League = match.League,
            EventTag = match.EventTag,
            GameModeId = match.GameModeId,
        };
    }
}
