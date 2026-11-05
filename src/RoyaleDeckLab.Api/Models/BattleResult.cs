namespace RoyaleDeckLab.Api.Models;

public enum BattleResult
{
    Win,
    Loss,
    Draw
}

public static class BattleResultExtensions
{
    public static double WinShare(this BattleResult result) => result switch
    {
        BattleResult.Win => 1.0,
        BattleResult.Draw => 0.5,
        _ => 0.0,
    };
}
