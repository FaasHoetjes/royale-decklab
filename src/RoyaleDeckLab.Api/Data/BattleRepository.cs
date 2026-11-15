using System.Data.Common;
using System.Globalization;
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
        var pKey = AddParameter(cmd, "$key");
        var pTime = AddParameter(cmd, "$battleTime");
        var pTimeMs = AddParameter(cmd, "$battleTimeMs");
        var pTag = AddParameter(cmd, "$playerTag");
        var pCards = AddParameter(cmd, "$cardIds");
        var pResult = AddParameter(cmd, "$result");
        var pVersions = AddParameter(cmd, "$cardVersions");

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

    private static DbParameter AddParameter(SqliteCommand cmd, string name)
    {
        var parameter = cmd.CreateParameter();
        parameter.ParameterName = name;
        cmd.Parameters.Add(parameter);
        return parameter;
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

    public long GetPreviousEpochStart() => State().PreviousEpochStartMs;

    public (long Epoch, long Previous) GetEpochs()
    {
        var s = State();
        return (s.EpochStartMs, s.PreviousEpochStartMs);
    }

    /// <summary>Moves the patch boundary; the old one becomes the start of the previous patch, unless the boundary moved back.</summary>
    public async Task SetEpochStartAsync(long ms, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var s = State();
            if (ms > s.EpochStartMs)
            {
                s.PreviousEpochStartMs = s.EpochStartMs;
            }
            else if (s.PreviousEpochStartMs >= ms)
            {
                s.PreviousEpochStartMs = 0;
            }
            s.EpochStartMs = ms;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public HashSet<CardVersion> GetKnownCardVersions()
        => db.KnownCardVersions.AsNoTracking().AsEnumerable().Select(v => new CardVersion(v.CardId, v.Version)).ToHashSet();

    public Task AddKnownCardVersionsAsync(IEnumerable<CardVersion> versions, CancellationToken ct = default)
        => AddMissingAsync(
            db.KnownCardVersions,
            versions.Distinct().Select(v => new KnownCardVersionEntity { CardId = v.CardId, Version = v.Version }),
            e => [e.CardId, e.Version],
            ct);

    public HashSet<string> GetSeenPatchNotes() => db.SeenPatchNotes.AsNoTracking().Select(n => n.Key).ToHashSet();

    public Task AddSeenPatchNotesAsync(IEnumerable<string> keys, CancellationToken ct = default)
        => AddMissingAsync(db.SeenPatchNotes, keys.Distinct().Select(k => new SeenPatchNoteEntity { Key = k }), e => [e.Key], ct);

    public IReadOnlyList<PostedUpdate> GetBalanceUpdates()
        => db.BalanceUpdates.AsNoTracking().AsEnumerable()
            .Select(u => new PostedUpdate(
                DateOnly.ParseExact(u.Day, "yyyy-MM-dd", CultureInfo.InvariantCulture),
                u.NotesUrl,
                JsonSerializer.Deserialize<List<PostedChange>>(u.Changes, StorageJson.Options) ?? []))
            .OrderByDescending(u => u.Day)
            .ToList();

    /// <summary>
    /// Adds or replaces each day's update and says whether anything changed. An update read without any changes is
    /// skipped: that's a page that came through wrong, not an update taken back.
    /// </summary>
    public async Task<bool> SaveBalanceUpdatesAsync(IEnumerable<PostedUpdate> updates, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var hasChanged = false;
            foreach (var update in updates.Where(u => u.Changes.Count > 0).GroupBy(u => u.Day).Select(g => g.MaxBy(u => u.Changes.Count)!))
            {
                var day = update.Day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
                var changes = JsonSerializer.Serialize(update.Changes, StorageJson.Options);
                var row = await db.BalanceUpdates.FindAsync([day], ct);
                if (row is null)
                {
                    db.BalanceUpdates.Add(new BalanceUpdateEntity { Day = day, NotesUrl = update.NotesUrl, Changes = changes });
                    hasChanged = true;
                }
                else if (row.NotesUrl != update.NotesUrl || row.Changes != changes)
                {
                    row.NotesUrl = update.NotesUrl;
                    row.Changes = changes;
                    hasChanged = true;
                }
            }
            await db.SaveChangesAsync(ct);
            return hasChanged;
        }
        finally
        {
            WriteGate.Release();
        }
    }

    public HashSet<int> GetSeasonBoosts() => db.SeasonBoosts.AsNoTracking().Select(b => b.CardId).ToHashSet();

    public async Task ReplaceSeasonBoostsAsync(IReadOnlySet<int> cardIds, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            db.SeasonBoosts.RemoveRange(db.SeasonBoosts);
            db.SeasonBoosts.AddRange(cardIds.Select(id => new SeasonBoostEntity { CardId = id }));
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    private async Task AddMissingAsync<T>(DbSet<T> set, IEnumerable<T> rows, Func<T, object[]> key, CancellationToken ct)
        where T : class
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            foreach (var row in rows)
            {
                if (await set.FindAsync(key(row), ct) is null)
                {
                    set.Add(row);
                }
            }
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

    public CardPeriod? GetCardPeriod(long endMs)
    {
        var e = db.CardPeriods.AsNoTracking().FirstOrDefault(p => p.EndMs == endMs);
        return e is null ? null : new CardPeriod(e.StartMs, e.EndMs, e.Battles, e.Cards);
    }

    public async Task SaveCardPeriodAsync(CardPeriod period, CancellationToken ct = default)
    {
        await WriteGate.WaitAsync(ct);
        try
        {
            var e = await db.CardPeriods.FindAsync([period.EndMs], ct);
            if (e is null)
            {
                e = new CardPeriodEntity { EndMs = period.EndMs };
                db.CardPeriods.Add(e);
            }
            e.StartMs = period.StartMs;
            e.Battles = period.Battles;
            e.Cards = period.Cards;
            await db.SaveChangesAsync(ct);
        }
        finally
        {
            WriteGate.Release();
        }
    }

    // Reloaded each time: a long-lived scope, like a rebuild's, would otherwise keep the row from before another
    // scope moved the patch boundary.
    private MetaStateEntity State()
    {
        var state = db.MetaState.Find(1)
                    ?? throw new InvalidOperationException("meta_state row missing. Was the DB initialised?");
        db.Entry(state).Reload();
        return state;
    }
}
