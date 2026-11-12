using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public enum MetaRebuildOutcome
{
    Rebuilt,

    /// <summary>Another rebuild was already running.</summary>
    Busy,

    /// <summary>The crawl brought no battles back, so the existing meta is kept.</summary>
    NothingFetched,

    /// <summary>The crawl or the tally threw; the existing meta is kept.</summary>
    Failed,

    Cancelled,
}

/// <param name="Decks">The meta after the rebuild: the existing one for every outcome but Rebuilt.</param>
public sealed record MetaRebuild(MetaRebuildOutcome Outcome, List<DeckMeta> Decks);
