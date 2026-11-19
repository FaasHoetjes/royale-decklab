namespace RoyaleDeckLab.Api.Models;

/// <summary>What the battle logs of the top war clans' members hold: their war battles, the Crown Series Duels and the ladder battles they played.</summary>
public sealed class WarClanCrawl
{
    public List<BattleRecord> WarBattles { get; } = [];

    public List<CrownSeriesRound> CrownSeriesRounds { get; } = [];

    /// <summary>Only the ones not stored yet: they're stored after each batch of clans.</summary>
    public List<LadderBattle> LadderBattles { get; } = [];

    public int LadderFound { get; set; }

    public int LadderAdded { get; set; }

    public void Add(WarClanCrawl other)
    {
        WarBattles.AddRange(other.WarBattles);
        CrownSeriesRounds.AddRange(other.CrownSeriesRounds);
        LadderBattles.AddRange(other.LadderBattles);
    }
}
