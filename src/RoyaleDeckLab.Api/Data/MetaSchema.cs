using Microsoft.EntityFrameworkCore;

namespace RoyaleDeckLab.Api.Data;

public static class MetaSchema
{
    /// <summary>
    /// Creates meta.db, and since EnsureCreated only creates a fresh database, adds the columns and tables that came
    /// after it to an older one.
    /// </summary>
    public static void EnsureMetaSchema(this WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MetaDbContext>();
        db.Database.EnsureCreated();
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
        db.Database.ExecuteSqlRaw("PRAGMA synchronous=NORMAL;");
        if (!HasStateColumn(db, "previous_epoch_start_ms"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN previous_epoch_start_ms INTEGER NOT NULL DEFAULT 0;");
        }
        if (!HasStateColumn(db, "last_crown_series_poll_ms"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN last_crown_series_poll_ms INTEGER NOT NULL DEFAULT 0;");
        }
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS card_periods (
                end_ms INTEGER NOT NULL CONSTRAINT PK_card_periods PRIMARY KEY,
                start_ms INTEGER NOT NULL,
                battles INTEGER NOT NULL,
                cards TEXT NOT NULL
            );
            """);
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS known_card_versions (
                card_id INTEGER NOT NULL,
                version TEXT NOT NULL,
                CONSTRAINT PK_known_card_versions PRIMARY KEY (card_id, version)
            );
            """);
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS seen_patch_notes (
                key TEXT NOT NULL CONSTRAINT PK_seen_patch_notes PRIMARY KEY
            );
            """);
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS balance_updates (
                day TEXT NOT NULL CONSTRAINT PK_balance_updates PRIMARY KEY,
                notes_url TEXT NOT NULL,
                changes TEXT NOT NULL
            );
            """);
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS crown_series_rounds (
                player_tag TEXT NOT NULL,
                battle_time_ms INTEGER NOT NULL,
                round INTEGER NOT NULL,
                opponent_tag TEXT NOT NULL,
                result TEXT NOT NULL,
                cards TEXT NOT NULL,
                league INTEGER NOT NULL,
                event_tag TEXT NOT NULL,
                game_mode_id INTEGER NOT NULL,
                CONSTRAINT PK_crown_series_rounds PRIMARY KEY (player_tag, battle_time_ms, round)
            );
            """);
        db.Database.ExecuteSqlRaw(
            "CREATE INDEX IF NOT EXISTS idx_crown_series_rounds_time ON crown_series_rounds (battle_time_ms);");
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS season_boosts (
                card_id INTEGER NOT NULL CONSTRAINT PK_season_boosts PRIMARY KEY
            );
            """);
        db.Database.ExecuteSqlRaw(
            "INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms) VALUES (1, 0, 0);");
    }

    private static bool HasStateColumn(MetaDbContext db, string name) => db.Database.SqlQuery<int>(
        $"SELECT COUNT(*) AS Value FROM pragma_table_info('meta_state') WHERE name = {name}").Single() > 0;
}
