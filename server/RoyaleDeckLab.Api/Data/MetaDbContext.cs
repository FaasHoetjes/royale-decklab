using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

/// <summary>
/// EF Core context over the SQLite battle store (meta.db). The schema mirrors
/// what the Bun BattleStore created: an indexed <c>battles</c> table and a
/// single-row <c>meta_state</c> table. Card ids / versions are JSON text columns.
/// </summary>
public sealed class MetaDbContext(DbContextOptions<MetaDbContext> options) : DbContext(options)
{
    public DbSet<BattleEntity> Battles => Set<BattleEntity>();
    public DbSet<MetaStateEntity> MetaState => Set<MetaStateEntity>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var cardIdsConverter = new ValueConverter<int[], string>(
            v => JsonSerializer.Serialize(v, StorageJson.Options),
            v => JsonSerializer.Deserialize<int[]>(v, StorageJson.Options) ?? Array.Empty<int>());

        var cardIdsComparer = new ValueComparer<int[]>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(17, (h, i) => HashCode.Combine(h, i)),
            v => v.ToArray());

        var versionsConverter = new ValueConverter<IReadOnlyList<CardVersion>, string>(
            v => JsonSerializer.Serialize(v, StorageJson.Options),
            v => JsonSerializer.Deserialize<List<CardVersion>>(v, StorageJson.Options) ?? new List<CardVersion>());

        var versionsComparer = new ValueComparer<IReadOnlyList<CardVersion>>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(17, (h, x) => HashCode.Combine(h, x.GetHashCode())),
            v => v.ToList());

        // Stored as lowercase text ("win"/"loss"/"draw") to match the Bun rows.
        var resultConverter = new ValueConverter<BattleResult, string>(
            v => v.ToString().ToLowerInvariant(),
            v => Enum.Parse<BattleResult>(v, ignoreCase: true));

        modelBuilder.Entity<BattleEntity>(b =>
        {
            b.ToTable("battles");
            b.HasKey(x => x.Key);
            b.Property(x => x.Key).HasColumnName("key");
            b.Property(x => x.BattleTime).HasColumnName("battle_time").IsRequired();
            b.Property(x => x.BattleTimeMs).HasColumnName("battle_time_ms").IsRequired();
            b.Property(x => x.PlayerTag).HasColumnName("player_tag").IsRequired();
            b.Property(x => x.CardIds).HasColumnName("card_ids").HasConversion(cardIdsConverter, cardIdsComparer).IsRequired();
            b.Property(x => x.Result).HasColumnName("result").HasConversion(resultConverter).IsRequired();
            b.Property(x => x.CardVersions).HasColumnName("card_versions").HasConversion(versionsConverter, versionsComparer).IsRequired();
            b.HasIndex(x => x.BattleTimeMs).HasDatabaseName("idx_battles_time");
        });

        modelBuilder.Entity<MetaStateEntity>(m =>
        {
            m.ToTable("meta_state");
            m.HasKey(x => x.Id);
            m.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            m.Property(x => x.EpochStartMs).HasColumnName("epoch_start_ms").IsRequired();
            m.Property(x => x.LastBuildMs).HasColumnName("last_build_ms").IsRequired();
        });
    }
}
