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
        scope.ServiceProvider.GetRequiredService<MetaDbContext>().EnsureMetaSchema();
    }

    public static void EnsureMetaSchema(this MetaDbContext db)
    {
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
        if (!HasStateColumn(db, "last_season_boost_check_ms"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN last_season_boost_check_ms INTEGER NOT NULL DEFAULT 0;");
        }
        if (!HasStateColumn(db, "season_boosts_patch_start_ms"))
        {
            // The boosts already stored were found in the current patch; without the update the deploy would clear them.
            using var tx = db.Database.BeginTransaction();
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN season_boosts_patch_start_ms INTEGER NOT NULL DEFAULT 0;");
            db.Database.ExecuteSqlRaw("UPDATE meta_state SET season_boosts_patch_start_ms = epoch_start_ms;");
            tx.Commit();
        }
        if (!HasColumn(db, "battles", "opponent_key"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE battles ADD COLUMN opponent_key TEXT;");
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
            """
            CREATE TABLE IF NOT EXISTS duel_level_fits (
                fitted_at_ms INTEGER NOT NULL,
                cap INTEGER NOT NULL,
                latest_round_ms INTEGER NOT NULL,
                duels INTEGER NOT NULL,
                per_level REAL NOT NULL,
                per_level_error REAL NOT NULL,
                weakest_card REAL NOT NULL,
                weakest_card_error REAL NOT NULL,
                evo REAL NOT NULL,
                evo_error REAL NOT NULL,
                hero REAL NOT NULL,
                hero_error REAL NOT NULL,
                CONSTRAINT PK_duel_level_fits PRIMARY KEY (fitted_at_ms, cap)
            );
            """);
        db.Database.ExecuteSqlRaw(
            """
            CREATE TABLE IF NOT EXISTS duel_cushion_fits (
                fitted_at_ms INTEGER NOT NULL,
                cap INTEGER NOT NULL,
                latest_round_ms INTEGER NOT NULL,
                decks INTEGER NOT NULL,
                rounds INTEGER NOT NULL,
                spread REAL NOT NULL,
                prior_rounds REAL NOT NULL,
                CONSTRAINT PK_duel_cushion_fits PRIMARY KEY (fitted_at_ms, cap)
            );
            """);
        db.Database.ExecuteSqlRaw(
            "INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms) VALUES (1, 0, 0);");
    }

    private static bool HasStateColumn(MetaDbContext db, string name) => HasColumn(db, "meta_state", name);

    private static bool HasColumn(MetaDbContext db, string table, string name) => db.Database.SqlQuery<int>(
        $"SELECT COUNT(*) AS Value FROM pragma_table_info({table}) WHERE name = {name}").Single() > 0;
}
