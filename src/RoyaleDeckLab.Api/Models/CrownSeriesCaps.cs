namespace RoyaleDeckLab.Api.Models;

/// <summary>The level caps Crown Series leagues play at; leagues sharing a cap play the same game.</summary>
public static class CrownSeriesCaps
{
    public const int Lowest = 11;

    public static IReadOnlyList<int> All { get; } =
        Enumerable.Range(Lowest, LevelModel.MaxDisplayLevel - Lowest + 1).ToArray();

    /// <summary>
    /// The battle log gives levels after the league's cap, so the highest card either player fielded in a Duel shows
    /// the cap it was played at; the battle's own league number doesn't.
    /// </summary>
    public static int FromHighestLevel(int level) => Math.Clamp(level, Lowest, LevelModel.MaxDisplayLevel);
}
