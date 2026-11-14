using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public sealed record CardRelease(long FirstSeenMs, IReadOnlyList<CardVersion> Versions);

/// <summary>
/// Spots new cards, Evos and Heroes in crawled war battles. The battles say when one became playable, which needn't
/// be the season start (Mirror's Evo first turned up a week into the November 2026 season) nor the day the catalog
/// lists it.
/// </summary>
public sealed class CardReleases(CardCatalog catalog, TimeProvider clock, ILogger<CardReleases> logger)
{
    private const long Day = 24L * 60 * 60 * 1000;
    private const long ShareWindow = 7 * Day;

    // A release counts once it's in as many decks as all but the least played 5% of the Evos and Heroes already out.
    // Measured on November 2026's battles that bar was 1.27% of decks: Giant's Evo levelled off near 0.5% and Mirror's
    // near 0.14%, and treating either as a new patch made the deck win rates predict the following days worse.
    private const double ShareQuantile = 0.05;

    /// <summary>
    /// The versions in <paramref name="fresh"/> that haven't been seen before and are now played enough to count,
    /// with the first battle that used one. The first call only remembers what exists, so that the versions already
    /// out don't count as new.
    /// </summary>
    public async Task<CardRelease?> FindNewAsync(BattleRepository store, IReadOnlyList<BattleRecord> fresh, CancellationToken ct)
    {
        var known = store.GetKnownCardVersions();
        if (known.Count == 0)
        {
            await SeedAsync(store, ct);
            return null;
        }
        if (!fresh.SelectMany(Played).Any(v => !known.Contains(v)))
        {
            return null;
        }

        var usage = Usage.Measure(store.AllBattles(), known, clock.GetUtcNow().ToUnixTimeMilliseconds());
        var bar = usage.Bar();
        var released = new List<CardVersion>();
        foreach (var (version, firstSeen) in usage.FirstSeen)
        {
            var share = usage.Share(version);
            if (share >= bar)
            {
                released.Add(version);
                continue;
            }
            logger.LogInformation("Card version {CardId} {Version}, first played {FirstSeen:O}, is in {Share:P2} of decks; it counts from {Bar:P2}",
                version.CardId, version.Version, DateTimeOffset.FromUnixTimeMilliseconds(firstSeen), share ?? 0, bar);
        }
        return released.Count == 0
            ? null
            : new CardRelease(released.Min(v => usage.FirstSeen[v]), released);
    }

    // Seeded from the catalog as well as the stored battles: an Evo nobody played in the last 30 days isn't new.
    private async Task SeedAsync(BattleRepository store, CancellationToken ct)
    {
        IReadOnlyList<CatalogCard> cards;
        try
        {
            cards = await catalog.GetAsync(ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Card catalog unavailable; new card versions are watched from the next crawl");
            return;
        }
        if (cards.Count == 0)
        {
            return;
        }

        var versions = cards.SelectMany(InCatalog).Concat(store.AllBattles().SelectMany(Played)).ToHashSet();
        await store.AddKnownCardVersionsAsync(versions, ct);
        logger.LogInformation("Card release watch initialised with {Count} card versions", versions.Count);
    }

    private static IEnumerable<CardVersion> Played(BattleRecord battle)
        => battle.CardIds.Select(id => new CardVersion(id, CardVersionKind.Normal)).Concat(battle.CardVersions);

    private static IEnumerable<CardVersion> InCatalog(CatalogCard card)
    {
        yield return new CardVersion(card.Id, CardVersionKind.Normal);
        var bits = card.MaxEvolutionLevel ?? 0;
        if (EvolutionBits.OwnsEvo(bits))
        {
            yield return new CardVersion(card.Id, CardVersionKind.Evo);
        }
        // A battle records every champion as a Hero (MetaBuilder.FieldedVersion), whatever its bitmask says.
        if (EvolutionBits.OwnsHero(bits) || RarityExtensions.IsChampion(card.Rarity))
        {
            yield return new CardVersion(card.Id, CardVersionKind.Hero);
        }
    }

    /// <summary>How many of the last week's decks used each version, and when each unknown one was first played.</summary>
    private sealed class Usage
    {
        private readonly long _now;
        private readonly List<long> _recentDecks = [];
        private readonly Dictionary<CardVersion, int> _knownUses = new();
        private readonly Dictionary<CardVersion, List<long>> _unknownUses = new();

        private Usage(long nowMs) => _now = nowMs;

        public Dictionary<CardVersion, long> FirstSeen { get; } = new();

        public static Usage Measure(IEnumerable<BattleRecord> battles, IReadOnlySet<CardVersion> known, long nowMs)
        {
            var usage = new Usage(nowMs);
            foreach (var battle in battles)
            {
                var recent = battle.BattleTimeMs >= nowMs - ShareWindow;
                if (recent)
                {
                    usage._recentDecks.Add(battle.BattleTimeMs);
                }
                foreach (var version in Played(battle).Distinct())
                {
                    if (!known.Contains(version))
                    {
                        usage.FirstSeen[version] = Math.Min(usage.FirstSeen.GetValueOrDefault(version, long.MaxValue), battle.BattleTimeMs);
                        if (recent)
                        {
                            if (!usage._unknownUses.TryGetValue(version, out var uses))
                            {
                                usage._unknownUses[version] = uses = [];
                            }
                            uses.Add(battle.BattleTimeMs);
                        }
                    }
                    else if (recent && version.Version != CardVersionKind.Normal)
                    {
                        usage._knownUses[version] = usage._knownUses.GetValueOrDefault(version) + 1;
                    }
                }
            }
            return usage;
        }

        public double Bar()
        {
            var shares = _knownUses.Values.Select(uses => (double)uses / _recentDecks.Count).Order().ToList();
            return shares.Count == 0 ? 0 : shares[(int)(ShareQuantile * (shares.Count - 1))];
        }

        /// <summary>
        /// The share of the last week's decks since <paramref name="version"/> was first played that used it. Null
        /// for its first day, whose few battles would make a lucky start look like a release.
        /// </summary>
        public double? Share(CardVersion version)
        {
            var firstSeen = FirstSeen[version];
            if (_now - firstSeen < Day)
            {
                return null;
            }
            var from = Math.Max(firstSeen, _now - ShareWindow);
            var decks = _recentDecks.Count(ms => ms >= from);
            var uses = _unknownUses.GetValueOrDefault(version)?.Count(ms => ms >= from) ?? 0;
            return decks == 0 ? null : (double)uses / decks;
        }
    }
}
