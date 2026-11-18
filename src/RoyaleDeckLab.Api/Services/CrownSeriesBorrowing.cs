using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// How much a round at each cap counts in one league's decks. The league's own rounds count fully; other caps fill a
/// budget of the league's own size (at least <c>minBorrowedRounds</c>), the nearest caps first, so a big league
/// further away can't drown out a small one.
/// </summary>
public static class CrownSeriesBorrowing
{
    /// <param name="otherCapWeight">The most a round one cap away counts, compounding per cap further away.</param>
    public static IReadOnlyDictionary<int, double> WeightsFor(
        int cap, IReadOnlyDictionary<int, int> roundsPerCap, double otherCapWeight, int minBorrowedRounds)
    {
        var weights = new Dictionary<int, double> { [cap] = 1.0 };
        double budget = Math.Max(roundsPerCap.GetValueOrDefault(cap), minBorrowedRounds);
        var farthest = CrownSeriesCaps.All.Max(c => Math.Abs(c - cap));
        for (var distance = 1; distance <= farthest; distance++)
        {
            var atDistance = CrownSeriesCaps.All
                .Where(c => Math.Abs(c - cap) == distance)
                .ToList();
            var fullWeight = Math.Pow(otherCapWeight, distance);
            var available = atDistance.Sum(c => roundsPerCap.GetValueOrDefault(c) * fullWeight);
            var share = available <= 0 ? 0 : Math.Min(1.0, budget / available);
            foreach (var other in atDistance)
            {
                weights[other] = fullWeight * share;
            }
            budget = Math.Max(0, budget - available * share);
        }
        return weights;
    }
}
