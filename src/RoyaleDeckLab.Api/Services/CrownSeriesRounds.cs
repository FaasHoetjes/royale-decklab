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

    private static readonly HashSet<string> OtherKnownMultiDeckModes = new(StringComparer.Ordinal)
    {
        "Duel_1v1_Friendly",
        "Duel_1v1_Tournament",
    };

    public static bool IsCrownSeries(CrBattle battle) => battle.GameMode?.Name == GameModeName;

    /// <summary>
    /// The mode of a battle played with a multi-deck lineup that is neither a Crown Series Duel nor a known friendly or
    /// tournament Duel, such as a Crown Series mode Supercell added later; null for any other battle.
    /// </summary>
    public static string? UnknownMultiDeckMode(CrBattle battle)
    {
        var isMultiDeck = battle.DeckSelection == MultiDeckSelection;
        var mode = battle.GameMode?.Name ?? "";
        var isKnown = IsCrownSeries(battle) || OtherKnownMultiDeckModes.Contains(mode);
        return isMultiDeck && !isKnown ? mode : null;
    }

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

        var duel = new Duel(
            BattleRepository.ParseBattleTime(battle.BattleTime),
            league,
            eventTag,
            gameModeId);
        var teamRounds = team.Rounds ?? [];
        var opponentRounds = opponent.Rounds ?? [];
        if (teamRounds.Count == 0 || teamRounds.Count != opponentRounds.Count)
        {
            return [];
        }
        var roundCount = teamRounds.Count;

        var rounds = new List<CrownSeriesRound>(roundCount * 2);
        for (var r = 0; r < roundCount; r++)
        {
            var teamRound = ToRound(duel, teamTag, opponentTag, r, teamRounds[r], opponentRounds[r].Crowns);
            var opponentRound = ToRound(duel, opponentTag, teamTag, r, opponentRounds[r], teamRounds[r].Crowns);
            if (teamRound is null || opponentRound is null)
            {
                return [];
            }
            rounds.Add(teamRound);
            rounds.Add(opponentRound);
        }
        return rounds;
    }

    /// <summary>
    /// The cap of the latest complete Duel in the log, and when the latest Duel of any kind was played; 0 when the
    /// log has none.
    /// </summary>
    public static (int? Cap, long SeenMs) LatestCap(IReadOnlyList<CrBattle> log)
    {
        var duels = log
            .Where(IsCrownSeries)
            .Select(b => (TimeMs: BattleRepository.ParseBattleTime(b.BattleTime), Battle: b))
            .OrderByDescending(d => d.TimeMs)
            .ToList();
        var cap = duels
            .Select(d => CapOf(From(d.Battle)))
            .FirstOrDefault(c => c is not null);
        return (cap, duels.Count > 0 ? duels[0].TimeMs : 0);
    }

    /// <summary>The cap a Duel was played at, from all its rounds; null when it has none.</summary>
    public static int? CapOf(IReadOnlyList<CrownSeriesRound> rounds)
        => rounds.Count == 0 ? null : CrownSeriesCaps.FromHighestLevel(rounds.Max(r => r.Cards.Max(c => c.Level)));

    private sealed record Duel(long BattleTimeMs, int League, string EventTag, int GameModeId);

    private static CrownSeriesRound? ToRound(
        Duel duel, string playerTag, string opponentTag, int round, CrBattleRound played, int opponentCrowns)
    {
        if (PlayedCards.From(played.Cards) is not { } cards)
        {
            return null;
        }

        return new CrownSeriesRound
        {
            PlayerTag = playerTag,
            OpponentTag = opponentTag,
            BattleTimeMs = duel.BattleTimeMs,
            Round = round,
            Result = BattleResultExtensions.FromCrowns(played.Crowns, opponentCrowns),
            Cards = cards,
            League = duel.League,
            EventTag = duel.EventTag,
            GameModeId = duel.GameModeId,
        };
    }
}
