using Microsoft.Data.Sqlite;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services.Reminders;

/// <summary>
/// The clans' Discord reminders in their own SQLite file. Tokens are stored encrypted, and deleted rows are
/// overwritten on disk, so a removed webhook can't be read back from the file.
/// </summary>
public sealed class ReminderStore
{
    private readonly string _connectionString;
    private readonly WebhookTokenCipher _cipher;

    public ReminderStore(string path, WebhookTokenCipher cipher)
    {
        _cipher = cipher;
        _connectionString = new SqliteConnectionStringBuilder { DataSource = path }.ToString();
        using var connection = Open();
        Execute(connection, "PRAGMA journal_mode=WAL;");
        Execute(connection,
            """
            CREATE TABLE IF NOT EXISTS discord_reminders (
                webhook_id TEXT NOT NULL PRIMARY KEY,
                clan_tag TEXT NOT NULL,
                token BLOB NOT NULL,
                hours_before_reset INTEGER NOT NULL,
                style INTEGER NOT NULL,
                ping INTEGER NOT NULL,
                post_when_all_done INTEGER NOT NULL,
                reset_minute INTEGER NOT NULL,
                last_reminded_for_ms INTEGER,
                failures INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS discord_reminders_by_clan ON discord_reminders (clan_tag);
            """);
    }

    public IReadOnlyList<DiscordReminder> All() => Read("SELECT * FROM discord_reminders", _ => { });

    public IReadOnlyList<DiscordReminder> ForClan(ClanTag clan)
        => Read("SELECT * FROM discord_reminders WHERE clan_tag = @clan", c => c.Parameters.AddWithValue("@clan", clan.Value));

    public DiscordReminder? Find(string webhookId)
        => Read("SELECT * FROM discord_reminders WHERE webhook_id = @id", c => c.Parameters.AddWithValue("@id", webhookId))
            .FirstOrDefault();

    public int Count()
    {
        using var connection = Open();
        using var command = Command(connection, "SELECT COUNT(*) FROM discord_reminders");
        return Convert.ToInt32(command.ExecuteScalar());
    }

    public void Save(DiscordReminder reminder)
    {
        using var connection = Open();
        using var upsert = Command(connection,
            """
            INSERT INTO discord_reminders (webhook_id, clan_tag, token, hours_before_reset, style, ping, post_when_all_done,
                reset_minute, last_reminded_for_ms, failures)
            VALUES (@id, @clan, @token, @hours, @style, @ping, @allDone, @resetMinute, @lastReminded, @failures)
            ON CONFLICT (webhook_id) DO UPDATE SET
                clan_tag = excluded.clan_tag,
                token = excluded.token,
                hours_before_reset = excluded.hours_before_reset,
                style = excluded.style,
                ping = excluded.ping,
                post_when_all_done = excluded.post_when_all_done,
                reset_minute = excluded.reset_minute,
                last_reminded_for_ms = excluded.last_reminded_for_ms,
                failures = excluded.failures
            """);
        var webhook = reminder.Webhook;
        var lastReminded = reminder.LastRemindedFor?.ToUnixTimeMilliseconds();
        upsert.Parameters.AddWithValue("@id", webhook.Id);
        upsert.Parameters.AddWithValue("@clan", reminder.Clan.Value);
        upsert.Parameters.AddWithValue("@token", _cipher.Encrypt(webhook.Id, webhook.Token));
        upsert.Parameters.AddWithValue("@hours", reminder.Settings.HoursBeforeReset);
        upsert.Parameters.AddWithValue("@style", (int)reminder.Settings.Style);
        upsert.Parameters.AddWithValue("@ping", (int)reminder.Settings.Ping);
        upsert.Parameters.AddWithValue("@allDone", reminder.Settings.PostWhenAllDone);
        upsert.Parameters.AddWithValue("@resetMinute", (int)reminder.ResetTimeOfDay.TotalMinutes);
        upsert.Parameters.AddWithValue("@lastReminded", (object?)lastReminded ?? DBNull.Value);
        upsert.Parameters.AddWithValue("@failures", reminder.Failures);
        upsert.ExecuteNonQuery();
    }

    public void Delete(string webhookId)
    {
        using var connection = Open();
        using var delete = Command(connection, "DELETE FROM discord_reminders WHERE webhook_id = @id");
        delete.Parameters.AddWithValue("@id", webhookId);
        delete.ExecuteNonQuery();
        Execute(connection, "PRAGMA wal_checkpoint(TRUNCATE);");
    }

    private List<DiscordReminder> Read(string sql, Action<SqliteCommand> bind)
    {
        using var connection = Open();
        using var command = Command(connection, sql);
        bind(command);
        using var reader = command.ExecuteReader();
        var reminders = new List<DiscordReminder>();
        while (reader.Read())
        {
            reminders.Add(ToReminder(reader));
        }
        return reminders;
    }

    private DiscordReminder ToReminder(SqliteDataReader row)
    {
        var webhookId = row.GetString(row.GetOrdinal("webhook_id"));
        var token = _cipher.Decrypt(webhookId, (byte[])row["token"]);
        if (!ClanTag.TryParse(row.GetString(row.GetOrdinal("clan_tag")), out var clan))
        {
            throw new FormatException("A stored Discord reminder has an invalid clan tag");
        }

        var settings = new ReminderSettings(
            row.GetInt32(row.GetOrdinal("hours_before_reset")),
            (ReminderMessageStyle)row.GetInt32(row.GetOrdinal("style")),
            (ReminderPing)row.GetInt32(row.GetOrdinal("ping")),
            row.GetBoolean(row.GetOrdinal("post_when_all_done")));
        var lastRemindedOrdinal = row.GetOrdinal("last_reminded_for_ms");
        DateTimeOffset? lastReminded = row.IsDBNull(lastRemindedOrdinal)
            ? null
            : DateTimeOffset.FromUnixTimeMilliseconds(row.GetInt64(lastRemindedOrdinal));

        return new DiscordReminder(
            new DiscordWebhook(webhookId, token),
            clan,
            settings,
            TimeSpan.FromMinutes(row.GetInt32(row.GetOrdinal("reset_minute"))),
            lastReminded,
            row.GetInt32(row.GetOrdinal("failures")));
    }

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
