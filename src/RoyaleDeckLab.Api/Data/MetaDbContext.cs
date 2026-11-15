using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public sealed class MetaDbContext(DbContextOptions<MetaDbContext> options) : DbContext(options)
{
    public DbSet<BattleEntity> Battles => Set<BattleEntity>();
    public DbSet<CrownSeriesRoundEntity> CrownSeriesRounds => Set<CrownSeriesRoundEntity>();
    public DbSet<MetaStateEntity> MetaState => Set<MetaStateEntity>();
    public DbSet<CardPeriodEntity> CardPeriods => Set<CardPeriodEntity>();
    public DbSet<KnownCardVersionEntity> KnownCardVersions => Set<KnownCardVersionEntity>();
    public DbSet<SeenPatchNoteEntity> SeenPatchNotes => Set<SeenPatchNoteEntity>();
    public DbSet<BalanceUpdateEntity> BalanceUpdates => Set<BalanceUpdateEntity>();

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

        var talliesConverter = new ValueConverter<IReadOnlyList<CardTally>, string>(
            v => JsonSerializer.Serialize(v, StorageJson.Options),
            v => JsonSerializer.Deserialize<List<CardTally>>(v, StorageJson.Options) ?? new List<CardTally>());

        var talliesComparer = new ValueComparer<IReadOnlyList<CardTally>>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(17, (h, x) => HashCode.Combine(h, x.GetHashCode())),
            v => v.ToList());

        var levelsConverter = new ValueConverter<IReadOnlyList<CardLevel>, string>(
            v => JsonSerializer.Serialize(v, StorageJson.Options),
            v => JsonSerializer.Deserialize<List<CardLevel>>(v, StorageJson.Options) ?? new List<CardLevel>());

        var levelsComparer = new ValueComparer<IReadOnlyList<CardLevel>>(
            (a, b) => a!.SequenceEqual(b!),
            v => v.Aggregate(17, (h, x) => HashCode.Combine(h, x.GetHashCode())),
            v => v.ToList());

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

        modelBuilder.Entity<CrownSeriesRoundEntity>(r =>
        {
            r.ToTable("crown_series_rounds");
            r.HasKey(x => x.Key);
            r.Property(x => x.Key).HasColumnName("key");
            r.Property(x => x.MatchKey).HasColumnName("match_key").IsRequired();
            r.Property(x => x.PlayerTag).HasColumnName("player_tag").IsRequired();
            r.Property(x => x.BattleTime).HasColumnName("battle_time").IsRequired();
            r.Property(x => x.BattleTimeMs).HasColumnName("battle_time_ms").IsRequired();
            r.Property(x => x.Round).HasColumnName("round").IsRequired();
            r.Property(x => x.Result).HasColumnName("result").HasConversion(resultConverter).IsRequired();
            r.Property(x => x.CardIds).HasColumnName("card_ids").HasConversion(cardIdsConverter, cardIdsComparer).IsRequired();
            r.Property(x => x.CardLevels).HasColumnName("card_levels").HasConversion(levelsConverter, levelsComparer).IsRequired();
            r.Property(x => x.CardVersions).HasColumnName("card_versions").HasConversion(versionsConverter, versionsComparer).IsRequired();
            r.Property(x => x.League).HasColumnName("league").IsRequired();
            r.Property(x => x.EventTag).HasColumnName("event_tag").IsRequired();
            r.Property(x => x.GameModeId).HasColumnName("game_mode_id").IsRequired();
            r.HasIndex(x => x.BattleTimeMs).HasDatabaseName("idx_crown_series_rounds_time");
        });

        modelBuilder.Entity<MetaStateEntity>(m =>
        {
            m.ToTable("meta_state");
            m.HasKey(x => x.Id);
            m.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            m.Property(x => x.EpochStartMs).HasColumnName("epoch_start_ms").IsRequired();
            m.Property(x => x.PreviousEpochStartMs).HasColumnName("previous_epoch_start_ms").IsRequired().HasDefaultValue(0L);
            m.Property(x => x.LastBuildMs).HasColumnName("last_build_ms").IsRequired();
        });

        modelBuilder.Entity<KnownCardVersionEntity>(k =>
        {
            k.ToTable("known_card_versions");
            k.HasKey(x => new { x.CardId, x.Version });
            k.Property(x => x.CardId).HasColumnName("card_id").ValueGeneratedNever();
            k.Property(x => x.Version).HasColumnName("version").HasConversion<string>();
        });

        modelBuilder.Entity<SeenPatchNoteEntity>(n =>
        {
            n.ToTable("seen_patch_notes");
            n.HasKey(x => x.Key);
            n.Property(x => x.Key).HasColumnName("key");
        });

        modelBuilder.Entity<BalanceUpdateEntity>(u =>
        {
            u.ToTable("balance_updates");
            u.HasKey(x => x.Day);
            u.Property(x => x.Day).HasColumnName("day");
            u.Property(x => x.NotesUrl).HasColumnName("notes_url");
            u.Property(x => x.Changes).HasColumnName("changes");
        });

        modelBuilder.Entity<CardPeriodEntity>(c =>
        {
            c.ToTable("card_periods");
            c.HasKey(x => x.EndMs);
            c.Property(x => x.EndMs).HasColumnName("end_ms").ValueGeneratedNever();
            c.Property(x => x.StartMs).HasColumnName("start_ms").IsRequired();
            c.Property(x => x.Battles).HasColumnName("battles").IsRequired();
            c.Property(x => x.Cards).HasColumnName("cards").HasConversion(talliesConverter, talliesComparer).IsRequired();
        });
    }
}
