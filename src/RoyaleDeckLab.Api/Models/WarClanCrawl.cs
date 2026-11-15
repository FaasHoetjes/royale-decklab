namespace RoyaleDeckLab.Api.Models;

/// <summary>What the battle logs of the top war clans' members hold: their war battles and the Crown Series Duels they played.</summary>
public sealed class WarClanCrawl
{
    public List<BattleRecord> WarBattles { get; } = [];

    public List<CrownSeriesRound> CrownSeriesRounds { get; } = [];

    public void Add(WarClanCrawl other)
    {
        WarBattles.AddRange(other.WarBattles);
        CrownSeriesRounds.AddRange(other.CrownSeriesRounds);
    }
}
