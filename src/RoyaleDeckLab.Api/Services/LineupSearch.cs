using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

internal static class LineupSearch
{
    private const long SearchNodeBudget = 2_000_000;

    private const int BitsPerWord = 64;

    internal static List<(DeckMeta deck, double score)> FindOptimalLineup(
        IReadOnlyList<(DeckMeta deck, double score)> pool,
        int target,
        IReadOnlySet<int> requiredCards)
    {
        var n = pool.Count;
        if (n == 0 || target <= 0)
        {
            return [];
        }

        var bitOf = new Dictionary<int, int>();
        foreach (var (deck, _) in pool)
        {
            foreach (var id in deck.CardIds)
            {
                bitOf.TryAdd(id, bitOf.Count);
            }
        }
        var words = (bitOf.Count + BitsPerWord - 1) / BitsPerWord;
        var masks = new ulong[n][];
        for (var i = 0; i < n; i++)
        {
            var mask = new ulong[words];
            foreach (var id in pool[i].deck.CardIds)
            {
                SetBit(mask, bitOf[id]);
            }
            masks[i] = mask;
        }

        // A lineup only counts once it uses every required card; a required card that no deck in the pool has can't be met.
        var required = new ulong[words];
        foreach (var id in requiredCards)
        {
            if (!bitOf.TryGetValue(id, out var bit))
            {
                return [];
            }
            SetBit(required, bit);
        }
        var hasRequired = requiredCards.Count > 0;

        // reachable[i]: every card in decks i..n-1, to stop early once a missing required card can no longer be added.
        var reachable = new ulong[n + 1][];
        reachable[n] = new ulong[words];
        for (var i = n - 1; i >= 0; i--)
        {
            reachable[i] = new ulong[words];
            for (var w = 0; w < words; w++)
            {
                reachable[i][w] = reachable[i + 1][w] | masks[i][w];
            }
        }

        var prefix = new double[n + 1];
        for (var i = 0; i < n; i++)
        {
            prefix[i + 1] = prefix[i] + pool[i].score;
        }

        var bestPicks = GreedyPicks(pool, masks, words, target);
        if (hasRequired && !Covers(required, UnionOf(bestPicks, masks, words)))
        {
            bestPicks = [];
        }
        var bestCount = bestPicks.Length;
        var bestScore = 0.0;
        foreach (var p in bestPicks)
        {
            bestScore += pool[p].score;
        }

        var usedAt = new ulong[target + 1][];
        for (var d = 0; d <= target; d++)
        {
            usedAt[d] = new ulong[words];
        }
        var picks = new int[target];
        var nodes = 0L;

        void Search(int start, int depth, double score)
        {
            var used = usedAt[depth];
            var next = usedAt[depth + 1];
            for (var i = start; i < n; i++)
            {
                var take = Math.Min(target - depth, n - i);
                var boundCount = depth + take;
                var boundScore = score + prefix[i + take] - prefix[i];
                var cannotBeatBest = boundCount < bestCount || (boundCount == bestCount && boundScore <= bestScore);
                if (cannotBeatBest)
                {
                    return;
                }
                if (++nodes > SearchNodeBudget)
                {
                    return;
                }
                if (hasRequired && !CanStillCover(required, used, reachable[i]))
                {
                    return;
                }

                var mask = masks[i];
                if (Overlaps(used, mask))
                {
                    continue;
                }

                for (var w = 0; w < words; w++)
                {
                    next[w] = used[w] | mask[w];
                }
                picks[depth] = i;
                var newScore = score + pool[i].score;
                var beatsBest = depth + 1 > bestCount || (depth + 1 == bestCount && newScore > bestScore);
                if (beatsBest && (!hasRequired || Covers(required, next)))
                {
                    bestCount = depth + 1;
                    bestScore = newScore;
                    bestPicks = picks[..(depth + 1)];
                }
                if (depth + 1 < target)
                {
                    Search(i + 1, depth + 1, newScore);
                }
            }
        }
        Search(0, 0, 0);

        var lineup = new List<(DeckMeta deck, double score)>(bestCount);
        foreach (var p in bestPicks)
        {
            lineup.Add(pool[p]);
        }
        return lineup;
    }

    private static void SetBit(ulong[] bits, int bit)
        => bits[bit / BitsPerWord] |= 1UL << (bit % BitsPerWord);

    private static bool Covers(ulong[] required, ulong[] used)
    {
        for (var w = 0; w < required.Length; w++)
        {
            if ((required[w] & ~used[w]) != 0)
            {
                return false;
            }
        }
        return true;
    }

    private static bool CanStillCover(ulong[] required, ulong[] used, ulong[] reachable)
    {
        for (var w = 0; w < required.Length; w++)
        {
            if ((required[w] & ~(used[w] | reachable[w])) != 0)
            {
                return false;
            }
        }
        return true;
    }

    private static bool Overlaps(ulong[] used, ulong[] mask)
    {
        for (var w = 0; w < used.Length; w++)
        {
            if ((used[w] & mask[w]) != 0)
            {
                return true;
            }
        }
        return false;
    }

    private static ulong[] UnionOf(int[] picks, ulong[][] masks, int words)
    {
        var used = new ulong[words];
        foreach (var p in picks)
        {
            for (var w = 0; w < words; w++)
            {
                used[w] |= masks[p][w];
            }
        }
        return used;
    }

    private static int[] GreedyPicks(
        IReadOnlyList<(DeckMeta deck, double score)> pool, ulong[][] masks, int words, int target)
    {
        var used = new ulong[words];
        var picks = new List<int>(target);
        for (var i = 0; i < pool.Count && picks.Count < target; i++)
        {
            if (Overlaps(used, masks[i]))
            {
                continue;
            }
            for (var w = 0; w < words; w++)
            {
                used[w] |= masks[i][w];
            }
            picks.Add(i);
        }
        return [.. picks];
    }
}
