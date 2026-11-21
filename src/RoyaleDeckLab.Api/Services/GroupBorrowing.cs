namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// How much a battle in each group counts in one group's decks: Crown Series caps, Trophy Road ranges or Ranked
/// leagues. The group's own battles count fully; other groups fill a budget of the group's own size (at least
/// <c>minBorrowed</c>), the nearest groups first, so a big group further away can't drown out a small one.
/// </summary>
public static class GroupBorrowing
{
    /// <param name="ordered">Every group, neighbours next to each other; the steps between them set the distance.</param>
    /// <param name="otherGroupWeight">The most a battle one group away counts, compounding per group further away.</param>
    public static IReadOnlyDictionary<TGroup, double> WeightsFor<TGroup>(
        TGroup own, IReadOnlyList<TGroup> ordered, IReadOnlyDictionary<TGroup, int> battlesPerGroup,
        double otherGroupWeight, int minBorrowed)
        where TGroup : notnull
    {
        var weights = new Dictionary<TGroup, double> { [own] = 1.0 };
        var ownIndex = IndexOf(ordered, own);
        double budget = Math.Max(battlesPerGroup.GetValueOrDefault(own), minBorrowed);
        var farthest = Math.Max(ownIndex, ordered.Count - 1 - ownIndex);
        for (var distance = 1; distance <= farthest; distance++)
        {
            var atDistance = new[] { ownIndex - distance, ownIndex + distance }
                .Where(i => i >= 0 && i < ordered.Count)
                .Select(i => ordered[i])
                .ToList();
            var fullWeight = Math.Pow(otherGroupWeight, distance);
            var available = atDistance.Sum(g => battlesPerGroup.GetValueOrDefault(g) * fullWeight);
            var share = available <= 0 ? 0 : Math.Min(1.0, budget / available);
            foreach (var other in atDistance)
            {
                weights[other] = fullWeight * share;
            }
            budget = Math.Max(0, budget - available * share);
        }
        return weights;
    }

    private static int IndexOf<TGroup>(IReadOnlyList<TGroup> ordered, TGroup group) where TGroup : notnull
    {
        for (var i = 0; i < ordered.Count; i++)
        {
            if (EqualityComparer<TGroup>.Default.Equals(ordered[i], group))
            {
                return i;
            }
        }
        throw new ArgumentException($"{group} isn't one of the groups", nameof(group));
    }
}
