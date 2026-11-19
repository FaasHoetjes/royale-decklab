using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using RoyaleDeckLab.Api.Data;
using RoyaleDeckLab.Api.Options;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class TestLadder : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"ladder-{Guid.NewGuid():N}.db");

    public void AddTo(IServiceCollection services, LadderOptions? options = null)
    {
        var ladderOptions = options ?? new LadderOptions();
        services.AddSingleton(Microsoft.Extensions.Options.Options.Create(ladderOptions));
        services.AddSingleton(_ => new LadderStore(_path, ladderOptions.TrophyBandWidth));
        services.AddSingleton<LadderIntake>();
        services.TryAddSingleton(TimeProvider.System);
    }

    public void Break() => File.WriteAllText(_path, "not a database, but long enough to be read as one's header");

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var suffix in new[] { "", "-wal", "-shm" })
        {
            File.Delete(_path + suffix);
        }
    }
}
