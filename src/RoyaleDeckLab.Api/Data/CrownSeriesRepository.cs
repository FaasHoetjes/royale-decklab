using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public sealed class CrownSeriesRepository(MetaDbContext db)
{
    /// <summary>Adds the rounds not stored yet and says how many that was; a round seen in an earlier poll is skipped.</summary>
    public async Task<int> MergeRoundsAsync(IReadOnlyCollection<CrownSeriesRound> rounds, CancellationToken ct = default)
    {
        if (rounds.Count == 0)
        {
            return 0;
        }

        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            return await InsertNewAsync(rounds, ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }

    private async Task<int> InsertNewAsync(IReadOnlyCollection<CrownSeriesRound> rounds, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var conn = (SqliteConnection)db.Database.GetDbConnection();
        await using var cmd = conn.CreateCommand();
        cmd.Transaction = (SqliteTransaction)tx.GetDbTransaction();
        cmd.CommandText =
            """
            INSERT OR IGNORE INTO crown_series_rounds
                (key, match_key, player_tag, battle_time, battle_time_ms, round, result,
                 card_ids, card_levels, card_versions, league, event_tag, game_mode_id)
            VALUES ($key, $matchKey, $playerTag, $battleTime, $battleTimeMs, $round, $result,
                    $cardIds, $cardLevels, $cardVersions, $league, $eventTag, $gameModeId)
            """;
        var pKey = cmd.Parameters.Add("$key", SqliteType.Text);
        var pMatchKey = cmd.Parameters.Add("$matchKey", SqliteType.Text);
        var pTag = cmd.Parameters.Add("$playerTag", SqliteType.Text);
        var pTime = cmd.Parameters.Add("$battleTime", SqliteType.Text);
        var pTimeMs = cmd.Parameters.Add("$battleTimeMs", SqliteType.Integer);
        var pRound = cmd.Parameters.Add("$round", SqliteType.Integer);
        var pResult = cmd.Parameters.Add("$result", SqliteType.Text);
        var pCards = cmd.Parameters.Add("$cardIds", SqliteType.Text);
        var pLevels = cmd.Parameters.Add("$cardLevels", SqliteType.Text);
        var pVersions = cmd.Parameters.Add("$cardVersions", SqliteType.Text);
        var pLeague = cmd.Parameters.Add("$league", SqliteType.Integer);
        var pEvent = cmd.Parameters.Add("$eventTag", SqliteType.Text);
        var pMode = cmd.Parameters.Add("$gameModeId", SqliteType.Integer);

        var added = 0;
        foreach (var r in rounds)
        {
            pKey.Value = r.Key;
            pMatchKey.Value = r.MatchKey;
            pTag.Value = r.PlayerTag;
            pTime.Value = r.BattleTime;
            pTimeMs.Value = r.BattleTimeMs;
            pRound.Value = r.Round;
            pResult.Value = r.Result.ToString().ToLowerInvariant();
            pCards.Value = JsonSerializer.Serialize(r.CardIds, StorageJson.Options);
            pLevels.Value = JsonSerializer.Serialize(r.CardLevels, StorageJson.Options);
            pVersions.Value = JsonSerializer.Serialize(r.CardVersions, StorageJson.Options);
            pLeague.Value = r.League;
            pEvent.Value = r.EventTag;
            pMode.Value = r.GameModeId;
            added += await cmd.ExecuteNonQueryAsync(ct);
        }
        await tx.CommitAsync(ct);
        return added;
    }

    public async Task<int> PruneAsync(long cutoffMs, CancellationToken ct = default)
    {
        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            return await db.CrownSeriesRounds
                .Where(r => r.BattleTimeMs < cutoffMs)
                .ExecuteDeleteAsync(ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }

    public IReadOnlyList<CrownSeriesRound> AllRounds()
        => db.CrownSeriesRounds
            .AsNoTracking()
            .AsEnumerable()
            .Select(r => new CrownSeriesRound
            {
                Key = r.Key,
                MatchKey = r.MatchKey,
                PlayerTag = r.PlayerTag,
                BattleTime = r.BattleTime,
                BattleTimeMs = r.BattleTimeMs,
                Round = r.Round,
                Result = r.Result,
                CardIds = r.CardIds,
                CardLevels = r.CardLevels,
                CardVersions = r.CardVersions,
                League = r.League,
                EventTag = r.EventTag,
                GameModeId = r.GameModeId,
            })
            .ToList();
}
