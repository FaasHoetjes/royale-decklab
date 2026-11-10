using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Services;

public sealed class MetaBuilder(
    ClashRoyaleClient client,
    IOptions<MetaOptions> options,
    ILogger<MetaBuilder> logger)
{
    private readonly MetaOptions _opt = options.Value;

    private const string WarBattleMode = "CW_Battle_1v1";

    public async Task<List<BattleRecord>> CollectWarBattleRecordsAsync(CancellationToken ct = default)
    {
        logger.LogInformation("Collecting WAR battle records...");
        var start = DateTime.UtcNow;

        var clanTags = await FetchTopWarClansAsync(ct);
        logger.LogInformation("Fetched {Count} top war clans", clanTags.Count);
        if (clanTags.Count == 0)
        {
            logger.LogWarning("No war clans found.");
            return [];
        }

        var records = await ProcessWarClansAsync(clanTags, _opt.WarRecordTarget, ct);

        var elapsed = (DateTime.UtcNow - start).TotalSeconds;
        logger.LogInformation("Collected {Count} war battle records in {Elapsed:F2}s", records.Count, elapsed);
        return records;
    }

    private async Task<List<string>> FetchTopWarClansAsync(CancellationToken ct)
    {
        try
        {
            var tags = await client.GetTopWarClansAsync(_opt.MaxWarClans, ct);
            return tags.Take(_opt.MaxWarClans).ToList();
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error fetching war clan rankings");
            return [];
        }
    }

    private async Task<List<BattleRecord>> ProcessWarClansAsync(List<string> clanTags, int target, CancellationToken ct)
    {
        var records = new List<BattleRecord>();
        var seenPlayers = new HashSet<string>();
        const int clanBatchSize = 10;

        var done = 0;
        foreach (var clanBatch in clanTags.Chunk(clanBatchSize))
        {
            var rosters = await Task.WhenAll(clanBatch.Select(async tag =>
            {
                try
                {
                    return await client.GetClanMemberTagsAsync(tag, ct);
                }
                catch (Exception ex) when (!ct.IsCancellationRequested)
                {
                    logger.LogWarning(ex, "Couldn't fetch the members of clan {ClanTag}; skipping it", tag);
                    return (IReadOnlyList<string>)[];
                }
            }));

            var members = rosters.SelectMany(r => r).Where(seenPlayers.Add).ToList();

            records.AddRange(await ProcessWarPlayersAsync(members, ct));
            done += clanBatch.Length;
            logger.LogInformation("Processed {Done}/{Total} clans ({Players} players, {Records} records)",
                done, clanTags.Count, seenPlayers.Count, records.Count);

            if (records.Count >= target)
            {
                logger.LogInformation("Reached war record target ({Target}); stopping early.", target);
                break;
            }
        }
        return records;
    }

    private async Task<List<BattleRecord>> ProcessWarPlayersAsync(List<string> tags, CancellationToken ct)
    {
        var records = new List<BattleRecord>();
        const int batchSize = 10;
        foreach (var batch in tags.Chunk(batchSize))
        {
            var results = await Task.WhenAll(batch.Select(tag => ProcessWarBattleLogAsync(tag, ct)));
            foreach (var playerRecords in results)
            {
                records.AddRange(playerRecords);
            }
        }
        return records;
    }

    private async Task<List<BattleRecord>> ProcessWarBattleLogAsync(string playerTag, CancellationToken ct)
    {
        var records = new List<BattleRecord>();
        try
        {
            var battles = await client.GetPlayerBattlelogAsync(playerTag, ct);
            foreach (var battle in battles)
            {
                var team = battle.Team?.FirstOrDefault();
                var opponent = battle.Opponent?.FirstOrDefault();
                if (team is null || opponent is null)
                {
                    continue;
                }

                if (battle.Type == "riverRacePvP" && battle.GameMode?.Name == WarBattleMode)
                {
                    RecordWarPair(records, playerTag, opponent.Tag, battle.BattleTime,
                        team.Cards, team.Crowns, opponent.Cards, opponent.Crowns);
                }
                else if (battle.Type == "riverRaceDuel")
                {
                    var teamRounds = team.Rounds ?? [];
                    var oppRounds = opponent.Rounds ?? [];
                    var rounds = Math.Min(teamRounds.Count, oppRounds.Count);
                    for (var r = 0; r < rounds; r++)
                    {
                        RecordWarPair(records, playerTag, opponent.Tag, battle.BattleTime,
                            teamRounds[r].Cards, teamRounds[r].Crowns, oppRounds[r].Cards, oppRounds[r].Crowns, $"|r{r}");
                    }
                }
            }
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            logger.LogError(ex, "Error processing a war battle log");
        }
        return records;
    }

    private static void RecordWarPair(
        List<BattleRecord> records,
        string playerTag,
        string? opponentTag,
        string battleTime,
        List<CrBattleCard>? teamCards, int teamCrowns,
        List<CrBattleCard>? oppCards, int oppCrowns,
        string keySuffix = "")
    {
        var (playerResult, opponentResult) = ResultsFor(teamCrowns, oppCrowns);

        var playerRecord = ToBattleRecord(playerTag, battleTime, teamCards, playerResult, keySuffix);
        if (playerRecord is not null)
        {
            records.Add(playerRecord);
        }
        if (!string.IsNullOrEmpty(opponentTag))
        {
            var opponentRecord = ToBattleRecord(opponentTag, battleTime, oppCards, opponentResult, keySuffix);
            if (opponentRecord is not null)
            {
                records.Add(opponentRecord);
            }
        }
    }

    private static (BattleResult player, BattleResult opponent) ResultsFor(int teamCrowns, int oppCrowns)
    {
        if (teamCrowns == oppCrowns)
        {
            return (BattleResult.Draw, BattleResult.Draw);
        }
        return teamCrowns > oppCrowns
            ? (BattleResult.Win, BattleResult.Loss)
            : (BattleResult.Loss, BattleResult.Win);
    }

    private static BattleRecord? ToBattleRecord(
        string tag, string battleTime, List<CrBattleCard>? cards, BattleResult result, string keySuffix = "")
    {
        if (cards is null || cards.Count == 0)
        {
            return null;
        }

        var cardIds = cards.Select(c => c.Id).OrderBy(id => id).ToArray();

        var cardVersions = cards.Select(card => new CardVersion(card.Id, FieldedVersion(card))).ToList();

        return new BattleRecord
        {
            Key = $"{tag}|{battleTime}{keySuffix}",
            BattleTime = battleTime,
            BattleTimeMs = BattleRepository.ParseBattleTime(battleTime),
            PlayerTag = tag,
            CardIds = cardIds,
            Result = result,
            CardVersions = cardVersions,
        };
    }

    // In a battle the level is the one version the card was played as (0, 1 or 2), not the bitmask of what the player
    // owns. A 3 only appears in boat defense lists and means "owns both", which doesn't say which one was played.
    public static CardVersionKind FieldedVersion(CrBattleCard card)
    {
        if (RarityExtensions.IsChampion(card.Rarity))
        {
            return CardVersionKind.Hero;
        }
        return card.EvolutionLevel switch
        {
            EvolutionBits.Evo => CardVersionKind.Evo,
            EvolutionBits.Hero => CardVersionKind.Hero,
            _ => CardVersionKind.Normal,
        };
    }

    public List<DeckMeta> AggregateBattles(IEnumerable<BattleRecord> records, long epochStartMs = 0)
    {
        var sampledPlayers = new HashSet<string>();

        var byDeck = new Dictionary<int[], DeckAgg>(SameCards.Instance);
        foreach (var record in records)
        {
            sampledPlayers.Add(record.PlayerTag);
            if (!byDeck.TryGetValue(record.CardIds, out var agg))
            {
                agg = new DeckAgg { CardIds = record.CardIds };
                byDeck[record.CardIds] = agg;
            }

            var isPreEpoch = epochStartMs > 0 && record.BattleTimeMs < epochStartMs;
            var weight = isPreEpoch ? _opt.PreEpochWeight : 1.0;
            agg.Games++;
            agg.WeightedGames += weight;
            agg.WeightedWins += weight * record.Result.WinShare();
            agg.Players.Add(record.PlayerTag);

            if (!agg.Loadouts.TryGetValue(record.CardVersions, out var loadout))
            {
                loadout = new LoadoutAgg { Versions = record.CardVersions };
                agg.Loadouts[record.CardVersions] = loadout;
            }
            loadout.Count++;
            if (string.CompareOrdinal(record.BattleTime, loadout.LatestTime) > 0)
            {
                loadout.LatestTime = record.BattleTime;
            }
        }

        var decks = new List<DeckMeta>(byDeck.Count);
        foreach (var agg in byDeck.Values)
        {
            if (agg.Games < 2)
            {
                continue;
            }

            decks.Add(new DeckMeta
            {
                CardIds = agg.CardIds,
                WinRate = agg.WeightedWins / agg.WeightedGames,
                Confidence = DomainMath.PosteriorQuantile(
                    agg.WeightedWins, agg.WeightedGames, _opt.PriorGames, _opt.PriorWinRate, _opt.RankingQuantile),
                Uses = agg.Games,
                Players = agg.Players.Count,
                PickRate = sampledPlayers.Count > 0 ? (double)agg.Players.Count / sampledPlayers.Count : 0,
                CardVersions = agg.Loadouts.Values
                    .OrderByDescending(l => l.Count)
                    .ThenByDescending(l => l.LatestTime, StringComparer.Ordinal)
                    .First().Versions,
            });
        }

        decks.Sort((a, b) => b.Confidence.CompareTo(a.Confidence));
        return decks;
    }

    // Battles are keyed by their cards and versions themselves: a text key for each of them was most of what a
    // rebuild allocated.
    private sealed class SameCards : IEqualityComparer<int[]>
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
        public string LatestTime = "";
        public required IReadOnlyList<CardVersion> Versions { get; init; }
    }
}
