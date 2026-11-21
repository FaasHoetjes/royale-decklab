using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>Adds up battles per deck and ranks the decks by their cautious win rate.</summary>
public sealed class DeckTally
{
    private readonly Dictionary<int[], DeckAgg> _byDeck = new(SameCards.Instance);
    private readonly HashSet<string> _players = [];

    /// <param name="cardIds">Sorted; kept as the deck's key, so the caller mustn't change it afterwards.</param>
    /// <param name="winShare">What the battle counts as won; level-adjusted shares can fall outside 0 to 1.</param>
    public void Add(
        int[] cardIds, IReadOnlyList<CardVersion> versions, long battleTimeMs, string playerTag, double weight, double winShare)
    {
        _players.Add(playerTag);
        if (!_byDeck.TryGetValue(cardIds, out var agg))
        {
            agg = new DeckAgg { CardIds = cardIds };
            _byDeck[cardIds] = agg;
        }

        agg.Games++;
        agg.WeightedGames += weight;
        agg.WeightedWins += weight * winShare;
        agg.Players.Add(playerTag);

        if (!agg.Loadouts.TryGetValue(versions, out var loadout))
        {
            loadout = new LoadoutAgg { Versions = versions };
            agg.Loadouts[versions] = loadout;
        }
        loadout.Count++;
        loadout.LatestTimeMs = Math.Max(loadout.LatestTimeMs, battleTimeMs);
    }

    /// <summary>Decks played at least twice, the most convincing first.</summary>
    public List<DeckMeta> Build(double priorGames, double priorWinRate, double rankingQuantile)
    {
        var decks = new List<DeckMeta>(_byDeck.Count);
        foreach (var agg in _byDeck.Values)
        {
            if (agg.Games < 2 || agg.WeightedGames <= 0)
            {
                continue;
            }

            var wins = Math.Clamp(agg.WeightedWins, 0, agg.WeightedGames);
            decks.Add(new DeckMeta
            {
                CardIds = agg.CardIds,
                WinRate = wins / agg.WeightedGames,
                Confidence = DomainMath.PosteriorQuantile(wins, agg.WeightedGames, priorGames, priorWinRate, rankingQuantile),
                Uses = agg.Games,
                Players = agg.Players.Count,
                PickRate = _players.Count > 0 ? (double)agg.Players.Count / _players.Count : 0,
                CardVersions = agg.Loadouts.Values
                    .OrderByDescending(l => l.Count)
                    .ThenByDescending(l => l.LatestTimeMs)
                    .First().Versions,
            });
        }

        decks.Sort((a, b) => b.Confidence.CompareTo(a.Confidence));
        return decks;
    }

    // Battles are keyed by their cards and versions themselves: a text key for each of them was most of what a
    // rebuild allocated.
    internal sealed class SameCards : IEqualityComparer<int[]>
    {
        public static readonly SameCards Instance = new();

        public bool Equals(int[]? a, int[]? b) => a is not null && b is not null && a.AsSpan().SequenceEqual(b);

        public int GetHashCode(int[] cardIds)
        {
            var hash = new HashCode();
            foreach (var id in cardIds)
            {
                hash.Add(id);
            }
            return hash.ToHashCode();
        }
    }

    /// <summary>The same versions of the same cards, in whatever order the battle listed them.</summary>
    private sealed class SameLoadout : IEqualityComparer<IReadOnlyList<CardVersion>>
    {
        public static readonly SameLoadout Instance = new();

        public bool Equals(IReadOnlyList<CardVersion>? a, IReadOnlyList<CardVersion>? b)
        {
            if (a is null || b is null || a.Count != b.Count)
            {
                return false;
            }
            for (var i = 0; i < a.Count; i++)
            {
                if (!Holds(b, a[i]))
                {
                    return false;
                }
            }
            return true;
        }

        public int GetHashCode(IReadOnlyList<CardVersion> versions)
        {
            var hash = 0;
            for (var i = 0; i < versions.Count; i++)
            {
                hash += HashCode.Combine(versions[i].CardId, versions[i].Version);
            }
            return hash;
        }

        private static bool Holds(IReadOnlyList<CardVersion> versions, CardVersion wanted)
        {
            for (var i = 0; i < versions.Count; i++)
            {
                if (versions[i].CardId == wanted.CardId && versions[i].Version == wanted.Version)
                {
                    return true;
                }
            }
            return false;
        }
    }

    private sealed class DeckAgg
    {
        public int Games;
        public double WeightedGames;
        public double WeightedWins;
        public HashSet<string> Players { get; } = [];
        public required int[] CardIds { get; init; }
        public Dictionary<IReadOnlyList<CardVersion>, LoadoutAgg> Loadouts { get; } = new(SameLoadout.Instance);
    }

    private sealed class LoadoutAgg
    {
        public int Count;
        public long LatestTimeMs;
        public required IReadOnlyList<CardVersion> Versions { get; init; }
    }
}
