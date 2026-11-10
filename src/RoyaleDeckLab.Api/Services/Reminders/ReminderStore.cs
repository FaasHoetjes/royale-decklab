using System.Security.Cryptography;
using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Reminders;

public enum ReminderSaveOutcome
{
    Saved,
    TooManyReminders,
    TooManyForServer,
}

/// <summary>
/// The clans' Discord reminders in their own SQLite file. Tokens are stored encrypted, and deleted rows are
/// overwritten on disk, so a removed webhook can't be read back from the file.
/// Setup writes a reminder's settings and the reminder job writes when it last posted, never the other way round,
/// so neither can undo the other's write and the job can't bring back a reminder that was just turned off.
/// </summary>
public sealed class ReminderStore
{
    private readonly string _connectionString;
    private readonly WebhookTokenCipher _cipher;
    private readonly ILogger<ReminderStore> _logger;
    private readonly object _saveGate = new();
    private int _hasWarnedUnreadable;

    public ReminderStore(string path, WebhookTokenCipher cipher, ILogger<ReminderStore> logger)
    {
        _cipher = cipher;
        _logger = logger;
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var connection = Open();
        Execute(connection, "PRAGMA journal_mode=WAL;");
        Execute(connection,
            """
            CREATE TABLE IF NOT EXISTS discord_reminders (
                webhook_id TEXT NOT NULL PRIMARY KEY,
                clan_tag TEXT NOT NULL,
                token BLOB NOT NULL,
                guild_id TEXT NOT NULL,
                hours_before_reset INTEGER NOT NULL,
                style INTEGER NOT NULL,
                ping INTEGER NOT NULL,
                post_when_all_done INTEGER NOT NULL,
                reset_minute INTEGER NOT NULL,
                last_reminded_for_ms INTEGER,
                failures INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS discord_reminders_by_clan ON discord_reminders (clan_tag);
            CREATE INDEX IF NOT EXISTS discord_reminders_by_guild ON discord_reminders (guild_id);
            """);
    }

    public IReadOnlyList<DiscordReminder> All() => Read("SELECT * FROM discord_reminders", _ => { });

    /// <summary>Decrypts only the tokens of the reminders that are due, as the job asks every minute.</summary>
    public IReadOnlyList<DiscordReminder> Due(DateTimeOffset now)
        => Read(
            "SELECT * FROM discord_reminders",
            _ => { },
            row => DiscordReminder.IsDue(ResetTimeOfDay(row), row.GetInt32(row.GetOrdinal("hours_before_reset")), LastRemindedFor(row), now));

    public IReadOnlyList<DiscordReminder> ForClan(ClanTag clan)
        => Read("SELECT * FROM discord_reminders WHERE clan_tag = @clan", c => c.Parameters.AddWithValue("@clan", clan.Value));

    public DiscordReminder? Find(string webhookId)
        => Read("SELECT * FROM discord_reminders WHERE webhook_id = @id", c => c.Parameters.AddWithValue("@id", webhookId))
            .FirstOrDefault();

    /// <summary>Only the reminders whose token still decrypts.</summary>
    public int Count() => All().Count;

    /// <summary>Every stored reminder, counted without decrypting a single token.</summary>
    public int RowCount()
    {
        using var connection = Open();
        using var command = Command(connection, "SELECT COUNT(*) FROM discord_reminders");
        return Convert.ToInt32(command.ExecuteScalar());
    }

    public int CountForServer(string guildId)
    {
        using var connection = Open();
        using var command = Command(connection, "SELECT COUNT(*) FROM discord_reminders WHERE guild_id = @guild");
        command.Parameters.AddWithValue("@guild", guildId);
        return Convert.ToInt32(command.ExecuteScalar());
    }

    /// <summary>
    /// Saves the reminder unless it's a new one that would go over a limit. Checking and saving happen together, so
    /// setups arriving at the same moment can't each pass the check and end up over the limit.
    /// </summary>
    public ReminderSaveOutcome SaveWithinLimits(DiscordReminder reminder, string guildId, int maxReminders, int maxPerServer)
    {
        lock (_saveGate)
        {
            var isNew = Find(reminder.Webhook.Id) is null;
            if (isNew && Count() >= maxReminders)
            {
                return ReminderSaveOutcome.TooManyReminders;
            }
            if (isNew && CountForServer(guildId) >= maxPerServer)
            {
                return ReminderSaveOutcome.TooManyForServer;
            }
            Save(reminder, guildId);
            return ReminderSaveOutcome.Saved;
        }
    }

    /// <summary>
    /// Adds the reminder, or changes an existing one's settings. When it moves to another clan, it hasn't posted for
    /// that clan yet; otherwise when it last posted is kept as it is.
    /// </summary>
    public void Save(DiscordReminder reminder, string guildId)
    {
        using var connection = Open();
        using var upsert = Command(connection,
            """
            INSERT INTO discord_reminders (webhook_id, clan_tag, token, guild_id, hours_before_reset, style, ping,
                post_when_all_done, reset_minute, last_reminded_for_ms, failures)
            VALUES (@id, @clan, @token, @guild, @hours, @style, @ping, @allDone, @resetMinute, NULL, 0)
            ON CONFLICT (webhook_id) DO UPDATE SET
                last_reminded_for_ms = CASE WHEN clan_tag = excluded.clan_tag THEN last_reminded_for_ms END,
                failures = CASE WHEN clan_tag = excluded.clan_tag THEN failures ELSE 0 END,
                clan_tag = excluded.clan_tag,
                token = excluded.token,
                guild_id = excluded.guild_id,
                hours_before_reset = excluded.hours_before_reset,
                style = excluded.style,
                ping = excluded.ping,
                post_when_all_done = excluded.post_when_all_done,
                reset_minute = excluded.reset_minute
            """);
        var webhook = reminder.Webhook;
        upsert.Parameters.AddWithValue("@id", webhook.Id);
        upsert.Parameters.AddWithValue("@clan", reminder.Clan.Value);
        upsert.Parameters.AddWithValue("@token", _cipher.Encrypt(webhook.Id, webhook.Token));
        upsert.Parameters.AddWithValue("@guild", guildId);
        upsert.Parameters.AddWithValue("@hours", reminder.Settings.HoursBeforeReset);
        upsert.Parameters.AddWithValue("@style", (int)reminder.Settings.Style);
        upsert.Parameters.AddWithValue("@ping", (int)reminder.Settings.Ping);
        upsert.Parameters.AddWithValue("@allDone", reminder.Settings.PostWhenAllDone);
        upsert.Parameters.AddWithValue("@resetMinute", ResetMinute(reminder.ResetTimeOfDay));
        upsert.ExecuteNonQuery();
    }

    /// <summary>
    /// Marks the reminder as posted for this reset before it's sent. Only one caller wins, so a post can't go out twice,
    /// even when the job restarts mid-post or runs twice.
    /// </summary>
    public bool TryClaim(string webhookId, DateTimeOffset reset)
    {
        using var connection = Open();
        using var claim = Command(connection,
            """
            UPDATE discord_reminders SET last_reminded_for_ms = @reset, failures = 0
            WHERE webhook_id = @id AND (last_reminded_for_ms IS NULL OR ABS(last_reminded_for_ms - @reset) >= @sameDay)
            """);
        claim.Parameters.AddWithValue("@id", webhookId);
        claim.Parameters.AddWithValue("@reset", reset.ToUnixTimeMilliseconds());
        claim.Parameters.AddWithValue("@sameDay", (long)DiscordReminder.SameDay.TotalMilliseconds);
        return claim.ExecuteNonQuery() == 1;
    }

    /// <summary>Puts back the posting state after a claim whose post Discord definitely didn't make.</summary>
    public void ReleaseClaim(DateTimeOffset reset, DiscordReminder afterFailure)
    {
        using var connection = Open();
        using var release = Command(connection,
            """
            UPDATE discord_reminders SET last_reminded_for_ms = @last, failures = @failures
            WHERE webhook_id = @id AND last_reminded_for_ms = @reset
            """);
        var last = afterFailure.LastRemindedFor?.ToUnixTimeMilliseconds();
        release.Parameters.AddWithValue("@id", afterFailure.Webhook.Id);
        release.Parameters.AddWithValue("@reset", reset.ToUnixTimeMilliseconds());
        release.Parameters.AddWithValue("@last", (object?)last ?? DBNull.Value);
        release.Parameters.AddWithValue("@failures", afterFailure.Failures);
        release.ExecuteNonQuery();
    }

    public void UpdateResetTime(string webhookId, DateTimeOffset dayEndsAt)
    {
        using var connection = Open();
        using var update = Command(connection,
            "UPDATE discord_reminders SET reset_minute = @resetMinute WHERE webhook_id = @id AND reset_minute <> @resetMinute");
        update.Parameters.AddWithValue("@id", webhookId);
        update.Parameters.AddWithValue("@resetMinute", ResetMinute(dayEndsAt.UtcDateTime.TimeOfDay));
        update.ExecuteNonQuery();
    }

    public void Delete(string webhookId)
    {
        using var connection = Open();
        using var delete = Command(connection, "DELETE FROM discord_reminders WHERE webhook_id = @id");
        delete.Parameters.AddWithValue("@id", webhookId);
        delete.ExecuteNonQuery();
        Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
    }

    private List<DiscordReminder> Read(string sql, Action<SqliteCommand> bind, Func<SqliteDataReader, bool>? isWanted = null)
    {
        using var connection = Open();
        using var command = Command(connection, sql);
        bind(command);
        using var reader = command.ExecuteReader();
        var reminders = new List<DiscordReminder>();
        var unreadable = 0;
        while (reader.Read())
        {
            var isSkipped = isWanted is not null && !isWanted(reader);
            if (isSkipped)
            {
                continue;
            }
            if (TryReadReminder(reader) is { } reminder)
            {
                reminders.Add(reminder);
                continue;
            }
            unreadable++;
        }

        var isFirstWarning = unreadable > 0 && Interlocked.Exchange(ref _hasWarnedUnreadable, 1) == 0;
        if (isFirstWarning)
        {
            _logger.LogWarning("Skipped {Count} Discord reminders whose token doesn't decrypt; was the encryption key changed?", unreadable);
        }
        return reminders;
    }

    /// <summary>Null when the token doesn't decrypt. Saving that webhook again overwrites the row.</summary>
    private DiscordReminder? TryReadReminder(SqliteDataReader row)
    {
        var webhookId = row.GetString(row.GetOrdinal("webhook_id"));
        string token;
        try
        {
            token = _cipher.Decrypt(webhookId, (byte[])row["token"]);
        }
        catch (CryptographicException)
        {
            return null;
        }

        if (!ClanTag.TryParse(row.GetString(row.GetOrdinal("clan_tag")), out var clan))
        {
            throw new FormatException("A stored Discord reminder has an invalid clan tag");
        }

        var settings = new ReminderSettings(
            row.GetInt32(row.GetOrdinal("hours_before_reset")),
            (ReminderMessageStyle)row.GetInt32(row.GetOrdinal("style")),
            (ReminderPing)row.GetInt32(row.GetOrdinal("ping")),
            row.GetBoolean(row.GetOrdinal("post_when_all_done")));

        return new DiscordReminder(
            new DiscordWebhook(webhookId, token),
            clan,
            settings,
            ResetTimeOfDay(row),
            LastRemindedFor(row),
            row.GetInt32(row.GetOrdinal("failures")));
    }

    private static TimeSpan ResetTimeOfDay(SqliteDataReader row) => TimeSpan.FromMinutes(row.GetInt32(row.GetOrdinal("reset_minute")));

    private static DateTimeOffset? LastRemindedFor(SqliteDataReader row)
    {
        var ordinal = row.GetOrdinal("last_reminded_for_ms");
        return row.IsDBNull(ordinal) ? null : DateTimeOffset.FromUnixTimeMilliseconds(row.GetInt64(ordinal));
    }

    private static int ResetMinute(TimeSpan timeOfDay) => (int)timeOfDay.TotalMinutes;

    private SqliteConnection Open()
    {
        var connection = new SqliteConnection(_connectionString);
        connection.Open();
        Execute(connection, "PRAGMA secure_delete=ON;");
        return connection;
    }

    private static SqliteCommand Command(SqliteConnection connection, string sql)
    {
        var command = connection.CreateCommand();
        command.CommandText = sql;
        return command;
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using var command = Command(connection, sql);
        command.ExecuteNonQuery();
    }
}
