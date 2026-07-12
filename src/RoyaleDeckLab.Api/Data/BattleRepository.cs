using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public sealed partial class BattleRepository(MetaDbContext db)
{
    private static readonly SemaphoreSlim WriteGate = new(1, 1);

    [GeneratedRegex(@"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})")]
    private static partial Regex BattleTimeRegex();

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

    public async Task<int> MergeBattlesAsync(IReadOnlyCollection<BattleRecord> records, CancellationToken ct = default)
    {
        if (records.Count == 0)
        {
            return 0;
        }

        await WriteGate.WaitAsync(ct);
        try
        {
            return await MergeBattlesCoreAsync(records, ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    private async Task<int> MergeBattlesCoreAsync(IReadOnlyCollection<BattleRecord> records, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var conn = (SqliteConnection)db.Database.GetDbConnection();
        await using var cmd = conn.CreateCommand();
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
            pTimeMs.Value = r.BattleTimeMs;
            pTag.Value = r.PlayerTag;
            pCards.Value = JsonSerializer.Serialize(r.CardIds, StorageJson.Options);
            pResult.Value = r.Result.ToString().ToLowerInvariant();
            pVersions.Value = JsonSerializer.Serialize(r.CardVersions, StorageJson.Options);
            added += await cmd.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return added;
    }

    public async Task<int> PruneAsync(long cutoffMs, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            return await db.Battles.Where(b => b.BattleTimeMs < cutoffMs).ExecuteDeleteAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public async Task ClearAsync(CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            await db.Battles.ExecuteDeleteAsync(ct);
            var s = State();
            s.EpochStartMs = 0;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public IEnumerable<BattleRecord> AllBattles()
    {
        foreach (var b in db.Battles.AsNoTracking())
        {
            yield return new BattleRecord
            {
                Key = b.Key,
                BattleTime = b.BattleTime,
                BattleTimeMs = b.BattleTimeMs,
                PlayerTag = b.PlayerTag,
                CardIds = b.CardIds,
                Result = b.Result,
                CardVersions = b.CardVersions,
            };
        }
    }

    public int Count() => db.Battles.Count();

    public long GetEpochStart() => State().EpochStartMs;

    public async Task SetEpochStartAsync(long ms, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var s = State();
            s.EpochStartMs = ms;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public int GetKnownSeasonId() => State().KnownSeasonId;

    public async Task SetKnownSeasonIdAsync(int seasonId, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var s = State();
            s.KnownSeasonId = seasonId;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public long GetLastBuild() => State().LastBuildMs;

    public async Task SetLastBuildAsync(long ms, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var s = State();
            s.LastBuildMs = ms;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    private MetaStateEntity State()
        => db.MetaState.Find(1)
           ?? throw new InvalidOperationException("meta_state row missing. Was the DB initialised?");
}
