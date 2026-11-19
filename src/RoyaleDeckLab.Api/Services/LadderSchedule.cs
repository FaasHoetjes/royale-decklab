using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// Also keeps the opponents a poll met but had no reads left for, at most a range's share per range, so the next
/// poll starts from them instead of finding them again.
/// </summary>
public sealed class LadderSchedule(IOptions<LadderOptions> options) : PlayerTracker<LadderGroup>(options.Value)
{
    private readonly object _metLock = new();
    private Dictionary<string, LadderGroup> _met = new(StringComparer.Ordinal);

    public void KeepMet(IEnumerable<(string Tag, LadderGroup Group)> opponents)
    {
        var kept = opponents
            .Where(o => !IsKnown(o.Tag))
            .GroupBy(o => o.Group)
            .SelectMany(inGroup => inGroup.Take(options.Value.MaxPlayersPerGroup))
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
