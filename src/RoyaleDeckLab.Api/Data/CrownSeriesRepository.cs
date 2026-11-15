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
                (player_tag, battle_time_ms, round, opponent_tag, result, cards, league, event_tag, game_mode_id)
            VALUES ($playerTag, $battleTimeMs, $round, $opponentTag, $result, $cards, $league, $eventTag, $gameModeId)
            """;
        var pTag = cmd.Parameters.Add("$playerTag", SqliteType.Text);
        var pTimeMs = cmd.Parameters.Add("$battleTimeMs", SqliteType.Integer);
        var pRound = cmd.Parameters.Add("$round", SqliteType.Integer);
        var pOpponent = cmd.Parameters.Add("$opponentTag", SqliteType.Text);
        var pResult = cmd.Parameters.Add("$result", SqliteType.Text);
        var pCards = cmd.Parameters.Add("$cards", SqliteType.Text);
        var pLeague = cmd.Parameters.Add("$league", SqliteType.Integer);
        var pEvent = cmd.Parameters.Add("$eventTag", SqliteType.Text);
        var pMode = cmd.Parameters.Add("$gameModeId", SqliteType.Integer);

        var added = 0;
        foreach (var r in rounds)
        {
            pTag.Value = r.PlayerTag;
            pTimeMs.Value = r.BattleTimeMs;
            pRound.Value = r.Round;
            pOpponent.Value = r.OpponentTag;
            pResult.Value = r.Result.ToString().ToLowerInvariant();
            pCards.Value = CrownSeriesCardStorage.Serialize(r.Cards);
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

    public long LatestBattleTimeMs()
        => db.CrownSeriesRounds
            .Select(r => (long?)r.BattleTimeMs)
            .Max() ?? 0;

    /// <summary>The players with the most stored rounds: they play the mode, so their logs show first whether Duels are on.</summary>
    public IReadOnlyList<string> MostActivePlayers(int count)
        => db.CrownSeriesRounds
            .GroupBy(r => r.PlayerTag)
            .OrderByDescending(g => g.Count())
            .Select(g => g.Key)
            .Take(count)
            .ToList();

    public IReadOnlyList<CrownSeriesRound> RoundsSince(long sinceMs)
        => db.CrownSeriesRounds
            .AsNoTracking()
            .Where(r => r.BattleTimeMs >= sinceMs)
            .AsEnumerable()
            .Select(r => new CrownSeriesRound
            {
                PlayerTag = r.PlayerTag,
                OpponentTag = r.OpponentTag,
                BattleTimeMs = r.BattleTimeMs,
                Round = r.Round,
                Result = r.Result,
                Cards = r.Cards,
                League = r.League,
                EventTag = r.EventTag,
                GameModeId = r.GameModeId,
            })
            .ToList();

    public long GetLastPollMs()
        => db.MetaState
            .AsNoTracking()
            .Select(s => s.LastCrownSeriesPollMs)
            .FirstOrDefault();

    public async Task SetLastPollMsAsync(long ms, CancellationToken ct = default)
    {
        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            await db.MetaState
                .Where(s => s.Id == 1)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.LastCrownSeriesPollMs, ms), ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }
}
