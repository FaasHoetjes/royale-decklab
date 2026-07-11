using Microsoft.Extensions.Options;
using RoyaleDeckLab.Api.Clients;
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

    public static double WilsonLowerBound(double wins, double total, double z = 1.96)
    {
        if (total <= 0)
        {
            return 0;
        }
        var p = wins / total;
        var z2 = z * z;
        var denominator = 1 + z2 / total;
        var center = p + z2 / (2 * total);
        var margin = z * Math.Sqrt((p * (1 - p) + z2 / (4 * total)) / total);
        return Math.Max(0, (center - margin) / denominator);
    }

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
        catch (Exception ex)
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
                try { return await client.GetClanMemberTagsAsync(tag, ct); }
                catch { return (IReadOnlyList<string>)[]; }
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
        catch (Exception ex)
        {
            logger.LogError(ex, "Error processing war battle log for {PlayerTag}", playerTag);
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
        var isDraw = teamCrowns == oppCrowns;
        var playerWon = teamCrowns > oppCrowns;
        var playerResult = isDraw ? BattleResult.Draw : playerWon ? BattleResult.Win : BattleResult.Loss;
        var opponentResult = isDraw ? BattleResult.Draw : playerWon ? BattleResult.Loss : BattleResult.Win;

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

    private static BattleRecord? ToBattleRecord(
        string tag, string battleTime, List<CrBattleCard>? cards, BattleResult result, string keySuffix = "")
    {
        if (cards is null || cards.Count == 0)
        {
            return null;
        }

        var cardIds = cards.Select(c => c.Id).OrderBy(id => id).ToArray();

        var cardVersions = cards.Select(card =>
        {
            var evo = card.EvolutionLevel ?? 0;
            var version = card.Rarity == "champion" || evo >= 2 ? CardVersionKind.Hero
                : evo == 1 ? CardVersionKind.Evo
                : CardVersionKind.Normal;
            return new CardVersion(card.Id, version);
        }).ToList();

        return new BattleRecord
        {
            Key = $"{tag}|{battleTime}{keySuffix}",
            BattleTime = battleTime,
            PlayerTag = tag,
            CardIds = cardIds,
            Result = result,
            CardVersions = cardVersions,
        };
    }

    public List<DeckMeta> AggregateBattles(IEnumerable<BattleRecord> records)
    {
        var sampledPlayers = new HashSet<string>();

        var byDeck = new Dictionary<string, DeckAgg>();
        foreach (var record in records)
        {
            sampledPlayers.Add(record.PlayerTag);
            var deckKey = string.Join(',', record.CardIds);
            if (!byDeck.TryGetValue(deckKey, out var agg))
            {
                agg = new DeckAgg { CardIds = record.CardIds };
                byDeck[deckKey] = agg;
            }

            switch (record.Result)
            {
                case BattleResult.Win: agg.Wins++; break;
                case BattleResult.Loss: agg.Losses++; break;
                default: agg.Draws++; break;
            }
            agg.Players.Add(record.PlayerTag);

            var comboKey = string.Join(',',
                record.CardVersions.OrderBy(v => v.CardId).Select(v => $"{v.CardId}:{(int)v.Version}"));
            if (!agg.Loadouts.TryGetValue(comboKey, out var loadout))
            {
                loadout = new LoadoutAgg { Versions = record.CardVersions };
                agg.Loadouts[comboKey] = loadout;
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
            var total = agg.Wins + agg.Losses + agg.Draws;
            if (total < 2)
            {
                continue;
            }

            var effectiveWins = agg.Wins + agg.Draws * 0.5;
            var winRate = effectiveWins / total;
            var confidence = WilsonLowerBound(effectiveWins, total);

            decks.Add(new DeckMeta
            {
                CardIds = agg.CardIds,
                WinRate = winRate,
                Confidence = confidence,
                Uses = total,
                Players = agg.Players.Count,
                PickRate = sampledPlayers.Count > 0 ? (double)agg.Players.Count / sampledPlayers.Count : 0,
                CardVersions = agg.Loadouts.Values
                    .OrderByDescending(l => l.Count)
                    .ThenByDescending(l => l.LatestTime, StringComparer.Ordinal)
                    .First().Versions,
            });
        }

        static double MetaScore(DeckMeta d) => d.Confidence * DomainMath.PopularityWeight(d.Players ?? 1);
        decks.Sort((a, b) => MetaScore(b).CompareTo(MetaScore(a)));
        return decks;
    }

    private sealed class DeckAgg
    {
        public int Wins;
        public int Losses;
        public int Draws;
        public HashSet<string> Players { get; } = [];
        public required int[] CardIds { get; init; }
        public Dictionary<string, LoadoutAgg> Loadouts { get; } = [];
    }

    private sealed class LoadoutAgg
    {
        public int Count;
        public string LatestTime = "";
        public required IReadOnlyList<CardVersion> Versions { get; init; }
    }
}
