namespace RoyaleDeckLab.Api.Models;

public enum WarPeriod
{
    Training,
    WarDay,
    Colosseum,

    /// <summary>The clan isn't in a river race this week, e.g. a clan that stopped playing wars.</summary>
    NotRacing,
}
