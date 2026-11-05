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
        if (!HasStateColumn(db, "known_season_id"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN known_season_id INTEGER NOT NULL DEFAULT 0;");
        }
        if (!HasStateColumn(db, "previous_epoch_start_ms"))
        {
            db.Database.ExecuteSqlRaw("ALTER TABLE meta_state ADD COLUMN previous_epoch_start_ms INTEGER NOT NULL DEFAULT 0;");
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
            "INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms, known_season_id) VALUES (1, 0, 0, 0);");
    }

    private static bool HasStateColumn(MetaDbContext db, string name) => db.Database.SqlQuery<int>(
        $"SELECT COUNT(*) AS Value FROM pragma_table_info('meta_state') WHERE name = {name}").Single() > 0;
}
