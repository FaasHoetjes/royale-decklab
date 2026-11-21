using System.Globalization;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;
using RoyaleDeckLab.Api.Services.Crawling;

namespace RoyaleDeckLab.Api.Data;

public sealed class CrownSeriesRepository(MetaDbContext db)
{
    private const string PlayersTable = "crown_series_players";

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

    /// <summary>
    /// Every stored round as one player's battle with one deck, with the cap its Duel was played at: the highest
    /// card either player fielded in any of its rounds.
    /// </summary>
    public IReadOnlyList<CappedBattle> ReadRoundsWithCaps()
    {
        var rounds = new List<(string Duel, BattleRecord Record, int HighestLevel)>();
        var highestByDuel = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var r in db.CrownSeriesRounds.AsNoTracking())
        {
            var duel = DuelKey(r.PlayerTag, r.OpponentTag, r.BattleTimeMs);
            var highest = r.Cards.Count == 0 ? 0 : r.Cards.Max(c => c.Level);
            highestByDuel[duel] = Math.Max(highestByDuel.GetValueOrDefault(duel), highest);
            rounds.Add((duel, ToBattle(r), highest));
        }
        return rounds
            .Select(r => new CappedBattle(r.Record, CrownSeriesCaps.FromHighestLevel(highestByDuel[r.Duel])))
            .ToList();
    }

    // Each round's first side is the player with the lower tag; a Duel missing either player's deck is left out.
    public IReadOnlyList<Duel> ReadDuels()
    {
        var byDuel = new Dictionary<string, List<CrownSeriesRoundEntity>>(StringComparer.Ordinal);
        foreach (var r in db.CrownSeriesRounds.AsNoTracking())
        {
            var key = DuelKey(r.PlayerTag, r.OpponentTag, r.BattleTimeMs);
            if (!byDuel.TryGetValue(key, out var rows))
            {
                byDuel[key] = rows = [];
            }
            rows.Add(r);
        }
        return byDuel.Values.Select(ToDuel).OfType<Duel>().ToList();
    }

    private static Duel? ToDuel(List<CrownSeriesRoundEntity> rows)
    {
        var first = rows.Select(r => r.PlayerTag).Order(StringComparer.Ordinal).First();
        var rounds = new List<PairedRound>();
        foreach (var round in rows.GroupBy(r => r.Round).OrderBy(g => g.Key))
        {
            var own = round.FirstOrDefault(r => r.PlayerTag == first);
            var other = round.FirstOrDefault(r => r.PlayerTag != first);
            if (own is null || other is null || own.Result == BattleResult.Draw || own.Cards.Count == 0 || other.Cards.Count == 0)
            {
                return null;
            }
            rounds.Add(new PairedRound(
                new DuelSide(own.PlayerTag, own.Cards), new DuelSide(other.PlayerTag, other.Cards), own.Result == BattleResult.Win));
        }
        var highest = rows.Max(r => r.Cards.Max(c => c.Level));
        return new Duel(CrownSeriesCaps.FromHighestLevel(highest), rounds);
    }

    private static string DuelKey(string playerTag, string opponentTag, long battleTimeMs)
        => string.CompareOrdinal(playerTag, opponentTag) < 0
            ? $"{playerTag}|{opponentTag}|{battleTimeMs}"
            : $"{opponentTag}|{playerTag}|{battleTimeMs}";

    private static BattleRecord ToBattle(CrownSeriesRoundEntity r) => new()
    {
        Key = $"{r.PlayerTag}|{r.BattleTimeMs}|{r.Round}",
        BattleTime = r.BattleTimeMs.ToString("D15", CultureInfo.InvariantCulture),
        BattleTimeMs = r.BattleTimeMs,
        PlayerTag = r.PlayerTag,
        CardIds = r.Cards.Select(c => c.Id).Order().ToArray(),
        Result = r.Result,
        CardVersions = r.Cards
            .OrderBy(c => c.Id)
            .Select(c => new CardVersion(c.Id, c.Version))
            .ToList(),
    };

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

    public long GetLastPollMs()
        => db.MetaState
            .AsNoTracking()
            .Select(s => s.LastCrownSeriesPollMs)
            .FirstOrDefault();

    public async Task SaveTrackedAsync(IReadOnlyCollection<TrackedPlayer<int>> players, CancellationToken ct = default)
    {
        await MetaWriteGate.Instance.WaitAsync(ct);
        try
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var conn = (SqliteConnection)db.Database.GetDbConnection();
            TrackedPlayerTable.Save(conn, (SqliteTransaction)tx.GetDbTransaction(), PlayersTable, players, cap => cap);
            await tx.CommitAsync(ct);
        }
        finally
        {
            MetaWriteGate.Instance.Release();
        }
    }

    public IReadOnlyList<TrackedPlayer<int>> LoadTracked()
    {
        db.Database.OpenConnection();
        try
        {
            return TrackedPlayerTable.Load((SqliteConnection)db.Database.GetDbConnection(), PlayersTable, key => (int)key);
        }
        finally
        {
            db.Database.CloseConnection();
        }
    }

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

public readonly record struct CappedBattle(BattleRecord Record, int Cap);
