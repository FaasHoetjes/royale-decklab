using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Counts each card's war battles per period, and compares this patch with the last.</summary>
public sealed class CardTallier((long From, long To)[] periods)
{
    private readonly Dictionary<int, Counts>[] _cards = periods.Select(_ => new Dictionary<int, Counts>()).ToArray();
    private readonly int[] _battles = new int[periods.Length];

    public void Add(BattleRecord battle)
    {
        var p = Array.FindIndex(periods, r => battle.BattleTimeMs >= r.From && battle.BattleTimeMs < r.To);
        if (p < 0)
        {
            return;
        }

        _battles[p]++;
        var win = battle.Result switch
        {
            BattleResult.Win => 1.0,
            BattleResult.Draw => 0.5,
            _ => 0.0,
        };
        foreach (var id in battle.CardIds)
        {
            if (!_cards[p].TryGetValue(id, out var counts))
            {
                counts = new Counts();
                _cards[p][id] = counts;
            }
            counts.Games++;
            counts.Wins += win;
        }
        foreach (var v in battle.CardVersions)
        {
            if (v.Version != CardVersionKind.Normal && _cards[p].TryGetValue(v.CardId, out var counts))
            {
                if (v.Version == CardVersionKind.Evo) counts.Evo++;
                else counts.Hero++;
            }
        }
    }

    public CardPeriod[] Periods()
        => periods.Select((r, p) => new CardPeriod(
            r.From,
            r.To,
            _battles[p],
            _cards[p].OrderBy(kv => kv.Key)
                .Select(kv => new CardTally(kv.Key, kv.Value.Games, kv.Value.Wins, kv.Value.Evo, kv.Value.Hero))
                .ToList()))
            .ToArray();

    private sealed class Counts
    {
        public int Games;
        public double Wins;
        public int Evo;
        public int Hero;
    }
}

public static class CardPeriods
{
    // A season starts on a Monday and war battles only start on Thursday, so for the first days of a patch
    // there is next to nothing to show; until this many battles are in, the page shows last patch's numbers.
    public const int MinCurrentBattles = 10_000;

    public const int MinGamesForChange = 100;

    public static CardStatsResponse Compare(CardPeriod current, CardPeriod? previous)
    {
        if (current.Battles < MinCurrentBattles && previous is { Battles: > 0 })
        {
            return new CardStatsResponse(
                Since: IsoOrNull(previous.StartMs),
                Until: MetaCache.IsoMs(previous.EndMs),
                Battles: previous.Battles,
                IsLastPatch: true,
                Cards: previous.Cards.Select(c => Stat(c, previous.Battles, null, 0)).ToList());
        }

        var before = previous?.Cards.ToDictionary(c => c.CardId);
        return new CardStatsResponse(
            Since: IsoOrNull(current.StartMs),
            Until: null,
            Battles: current.Battles,
            IsLastPatch: false,
            Cards: current.Cards
                .Select(c => Stat(c, current.Battles, before?.GetValueOrDefault(c.CardId), previous?.Battles ?? 0))
                .ToList());
    }

    private static CardStat Stat(CardTally card, int battles, CardTally? before, int battlesBefore)
    {
        var winRate = card.Wins / card.Games;
        double? previousWinRate = before is { Games: > 0 } ? before.Wins / before.Games : null;
        double? change = null;
        double? margin = null;
        if (previousWinRate is { } p0 && card.Games >= MinGamesForChange && before!.Games >= MinGamesForChange)
        {
            change = winRate - p0;
            // Two standard errors of the difference between two independent win rates.
            margin = 2 * Math.Sqrt(winRate * (1 - winRate) / card.Games + p0 * (1 - p0) / before.Games);
        }

        return new CardStat(
            Id: card.CardId,
            Games: card.Games,
            WinRate: winRate,
            PlayRate: battles > 0 ? (double)card.Games / battles : 0,
            EvoShare: (double)card.EvoGames / card.Games,
            HeroShare: (double)card.HeroGames / card.Games,
            PreviousGames: before?.Games ?? 0,
            PreviousWinRate: previousWinRate,
            PreviousPlayRate: before is not null && battlesBefore > 0 ? (double)before.Games / battlesBefore : null,
            WinRateChange: change,
            ChangeMargin: margin,
            ChangeIsClear: change is { } c && Math.Abs(c) >= margin);
    }

    private static string? IsoOrNull(long ms) => ms > 0 ? MetaCache.IsoMs(ms) : null;
}
