using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

// The aggregated meta is NOT persisted here: it's rebuilt from the battles on
// demand, so battles are the single source of truth. The bulk merge uses raw
// INSERT OR IGNORE because EF has no native upsert and war battles are full of
// cross-perspective duplicates (both sampled players log the same physical game).
public sealed partial class BattleRepository(MetaDbContext db)
{
    // SQLite allows a single writer at a time, and the background crawl's merge
    // and an admin /meta/epoch prune run on separate connections. Serialise every
    // write through one process-wide gate. NOT reentrant: a write method must
    // never call another write method while holding it.
    private static readonly SemaphoreSlim WriteGate = new(1, 1);

    [GeneratedRegex(@"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})")]
    private static partial Regex BattleTimeRegex();

    // Returns 0 on an unparseable value so such records sort as ancient and get pruned out.
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

    public int MergeBattles(IReadOnlyCollection<BattleRecord> records)
    {
        if (records.Count == 0)
        {
            return 0;
        }

        WriteGate.Wait();
        try
        {
            return MergeBattlesCore(records);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    private int MergeBattlesCore(IReadOnlyCollection<BattleRecord> records)
    {
        using var tx = db.Database.BeginTransaction();
        var conn = (SqliteConnection)db.Database.GetDbConnection();
        using var cmd = conn.CreateCommand();
        cmd.Transaction = (SqliteTransaction)tx.GetDbTransaction();
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

    public int Prune(long cutoffMs)
    {
        WriteGate.Wait();
        try
        {
            return db.Battles.Where(b => b.BattleTimeMs < cutoffMs).ExecuteDelete();
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public void Clear()
    {
        WriteGate.Wait();
        try
        {
            db.Battles.ExecuteDelete();
            // Inline rather than via SetEpochStart because the gate is not reentrant.
            var s = State();
            s.EpochStartMs = 0;
            db.SaveChanges();
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public List<BattleRecord> AllBattles()
    {
        // A LINQ projection over the converted collection columns can't be
        // translated to SQL, so enumerate the entities and map in a single pass.
        var records = new List<BattleRecord>();
        foreach (var b in db.Battles.AsNoTracking())
        {
            records.Add(new BattleRecord
            {
                Key = b.Key,
                BattleTime = b.BattleTime,
                PlayerTag = b.PlayerTag,
                CardIds = b.CardIds,
                Result = b.Result,
                CardVersions = b.CardVersions,
            });
        }
        return records;
    }

    public int Count() => db.Battles.Count();

    public long GetEpochStart() => State().EpochStartMs;

    public void SetEpochStart(long ms)
    {
        WriteGate.Wait();
        try
        {
            var s = State();
            s.EpochStartMs = ms;
            db.SaveChanges();
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public long GetLastBuild() => State().LastBuildMs;

    public void SetLastBuild(long ms)
    {
        WriteGate.Wait();
        try
        {
            var s = State();
            s.LastBuildMs = ms;
            db.SaveChanges();
        }
        finally
        {
            WriteGate.Release();
        }
    }

    // meta_state holds exactly one row, keyed Id = 1 (seeded at startup). A
    // primary-key lookup also avoids EF's "FirstOrDefault without OrderBy" warning.
    private MetaStateEntity State()
        => db.MetaState.Find(1)
           ?? throw new InvalidOperationException("meta_state row missing. Was the DB initialised?");
}
