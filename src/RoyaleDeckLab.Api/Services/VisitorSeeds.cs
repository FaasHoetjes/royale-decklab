namespace RoyaleDeckLab.Api.Services;

/// <summary>Players who looked themselves up on the site, handed to every poll that tracks players by their group.</summary>
public sealed class VisitorSeeds(CrownSeriesSchedule crownSeries, LadderSchedule ladder, TimeProvider time)
{
    public void Add(string tag)
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        crownSeries.AddVisitor(tag, now);
        ladder.AddVisitor(tag, now);
    }
}
