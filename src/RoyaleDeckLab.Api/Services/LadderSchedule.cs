using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Services;

// Opponents a poll had no reads left for are kept for one poll only, so none goes stale.
public sealed class LadderSchedule(IOptions<LadderOptions> options) : PlayerTracker<LadderGroup>(options.Value)
{
    private readonly object _metLock = new();
    private Dictionary<string, LadderGroup> _met = new(StringComparer.Ordinal);

    public void KeepMet(IEnumerable<(string Tag, LadderGroup Group)> opponents, long nowMs)
    {
        var kept = opponents
            .Where(o => CanTrack(o.Tag, nowMs))
            .GroupBy(o => o.Group)
            .SelectMany(inGroup => inGroup.Take(RoomIn(inGroup.Key)))
            .ToDictionary(o => o.Tag, o => o.Group, StringComparer.Ordinal);
        lock (_metLock)
        {
            _met = kept;
        }
    }

    public IReadOnlyList<(string Tag, LadderGroup Group)> TakeMet()
    {
        lock (_metLock)
        {
            var met = _met.Select(m => (m.Key, m.Value)).ToList();
            _met = new(StringComparer.Ordinal);
            return met;
        }
    }
}
