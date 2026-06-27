using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// SQLite-backed persistence for the rolling battle store and meta state — the
/// EF Core port of the Bun <c>battleStore.ts</c>. Battles live in one indexed
/// table: dedup is the primary key, pruning the window is one indexed DELETE, and
/// the aggregated meta is NOT persisted (it's rebuilt from the battles on demand,
/// so battles are the single source of truth).
///
/// Reads go through EF (AsNoTracking); the bulk merge uses raw INSERT OR IGNORE
/// because EF has no native upsert and war battles are full of cross-perspective
/// duplicates (both sampled players log the same physical game).
/// </summary>
public sealed partial class BattleRepository(MetaDbContext db)
{
    [GeneratedRegex(@"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})")]
    private static partial Regex BattleTimeRegex();

    /// <summary>
    /// Converts an API battleTime ("20240617T120000.000Z") to epoch ms. Returns 0
    /// on an unparseable value so such records sort as ancient and get pruned out.
    /// </summary>
    public static long ParseBattleTime(string battleTime)
    {
        var m = BattleTimeRegex().Match(battleTime);
        if (!m.Success)
        {
            return 0;
        }
        var dt = new DateTime(
            int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value),
            int.Parse(m.Groups[4].Value), int.Parse(m.Groups[5].Value), int.Parse(m.Groups[6].Value),
            DateTimeKind.Utc);
        return new DateTimeOffset(dt).ToUnixTimeMilliseconds();
    }

    /// <summary>
    /// Merges battle records, deduping on the primary key. Returns how many rows
    /// were newly inserted (duplicates are ignored and don't count) — the
    /// "+N new this fetch" figure.
    /// </summary>
    public int MergeBattles(IReadOnlyCollection<BattleRecord> records)
    {
        if (records.Count == 0)
        {
            return 0;
        }

        var conn = (SqliteConnection)db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open)
        {
            conn.Open();
        }

        using var tx = conn.BeginTransaction();
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            INSERT OR IGNORE INTO battles
                (key, battle_time, battle_time_ms, player_tag, card_ids, result, card_versions)
            VALUES ($key, $battleTime, $battleTimeMs, $playerTag, $cardIds, $result, $cardVersions)
            """;
        var pKey = cmd.CreateParameter(); pKey.ParameterName = "$key"; cmd.Parameters.Add(pKey);
        var pTime = cmd.CreateParameter(); pTime.ParameterName = "$battleTime"; cmd.Parameters.Add(pTime);
        var pTimeMs = cmd.CreateParameter(); pTimeMs.ParameterName = "$battleTimeMs"; cmd.Parameters.Add(pTimeMs);
        var pTag = cmd.CreateParameter(); pTag.ParameterName = "$playerTag"; cmd.Parameters.Add(pTag);
        var pCards = cmd.CreateParameter(); pCards.ParameterName = "$cardIds"; cmd.Parameters.Add(pCards);
        var pResult = cmd.CreateParameter(); pResult.ParameterName = "$result"; cmd.Parameters.Add(pResult);
        var pVersions = cmd.CreateParameter(); pVersions.ParameterName = "$cardVersions"; cmd.Parameters.Add(pVersions);

        var added = 0;
        foreach (var r in records)
        {
            pKey.Value = r.Key;
            pTime.Value = r.BattleTime;
            pTimeMs.Value = ParseBattleTime(r.BattleTime);
            pTag.Value = r.PlayerTag;
            pCards.Value = JsonSerializer.Serialize(r.CardIds, StorageJson.Options);
            pResult.Value = r.Result.ToString().ToLowerInvariant();
            pVersions.Value = JsonSerializer.Serialize(r.CardVersions, StorageJson.Options);
            added += cmd.ExecuteNonQuery();
        }
        tx.Commit();
        return added;
    }

    /// <summary>Deletes battles older than the cutoff (epoch ms). Returns rows removed.</summary>
    public int Prune(long cutoffMs)
        => db.Battles.Where(b => b.BattleTimeMs < cutoffMs).ExecuteDelete();

    /// <summary>Removes every battle and resets the patch boundary — for a clean rebuild.</summary>
    public void Clear()
    {
        db.Battles.ExecuteDelete();
        SetEpochStart(0);
    }

    /// <summary>All stored battles, mapped to BattleRecord for aggregation.</summary>
    public List<BattleRecord> AllBattles()
        // Materialise the entities first (EF applies the JSON value converters on
        // read), THEN map in memory — a LINQ projection over the converted
        // collection columns can't be translated to SQL.
        => db.Battles.AsNoTracking()
            .ToList()
            .Select(b => new BattleRecord
            {
                Key = b.Key,
                BattleTime = b.BattleTime,
                PlayerTag = b.PlayerTag,
                CardIds = b.CardIds,
                Result = b.Result,
                CardVersions = b.CardVersions,
            })
            .ToList();

    public int Count() => db.Battles.Count();

    public long GetEpochStart() => State().EpochStartMs;

    public void SetEpochStart(long ms)
    {
        var s = State();
        s.EpochStartMs = ms;
        db.SaveChanges();
    }

    public long GetLastBuild() => State().LastBuildMs;

    public void SetLastBuild(long ms)
    {
        var s = State();
        s.LastBuildMs = ms;
        db.SaveChanges();
    }

    private MetaStateEntity State()
        => db.MetaState.FirstOrDefault()
           ?? throw new InvalidOperationException("meta_state row missing — was the DB initialised?");
}
