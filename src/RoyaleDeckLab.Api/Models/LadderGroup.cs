using RoyaleDeckLab.Api.Options;

namespace RoyaleDeckLab.Api.Models;

/// <param name="Floor">The lowest trophies of a Trophy Road range, or the Ranked league.</param>
public readonly record struct LadderGroup(LadderMode Mode, int Floor)
{
    /// <summary>Null below <see cref="LadderOptions.MinTrophies"/>.</summary>
    public static LadderGroup? Of(LadderMode mode, int standing, LadderOptions options) => mode switch
    {
        LadderMode.TrophyRoad when standing < options.MinTrophies => null,
        LadderMode.TrophyRoad => new LadderGroup(mode, standing / options.TrophyBandWidth * options.TrophyBandWidth),
        _ => new LadderGroup(mode, standing),
    };

    public static LadderGroup? Of(LadderBattle side, LadderOptions options) => Of(side.Mode, side.Standing, options);

    public override string ToString() => Mode == LadderMode.TrophyRoad ? $"{Floor}+" : $"league {Floor}";
}
