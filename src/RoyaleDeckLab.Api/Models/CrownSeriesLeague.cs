namespace RoyaleDeckLab.Api.Models;

/// <summary>A Crown Series league; King's League covers leagues 9 to 13, which share one cap.</summary>
public enum CrownSeriesLeague
{
    Dagger,
    Pancake,
    Mustache,
    Magic,
    Hammer,
    Armor,
    Phantom,
    Queens,
    Kings,
}

public static class CrownSeriesLeagueExtensions
{
    /// <summary>The highest level a card plays at in this league; a card below it keeps its own level.</summary>
    public static int LevelCap(this CrownSeriesLeague league) => league switch
    {
        CrownSeriesLeague.Dagger or CrownSeriesLeague.Pancake => 11,
        CrownSeriesLeague.Mustache or CrownSeriesLeague.Magic => 12,
        CrownSeriesLeague.Hammer or CrownSeriesLeague.Armor => 13,
        CrownSeriesLeague.Phantom => 14,
        CrownSeriesLeague.Queens => 15,
        CrownSeriesLeague.Kings => LevelModel.MaxDisplayLevel,
        _ => throw new ArgumentOutOfRangeException(nameof(league), league, null),
    };

    public static bool TryParse(string? value, out CrownSeriesLeague league)
    {
        league = CrownSeriesLeague.Kings;
        return value is not null
            && !int.TryParse(value, out _)
            && Enum.TryParse(value, ignoreCase: true, out league)
            && Enum.IsDefined(league);
    }

    /// <summary>The player's cards at the levels they play at in this league.</summary>
    public static Dictionary<int, PlayerItemLevel> CapLevels(
        this CrownSeriesLeague league, IReadOnlyDictionary<int, PlayerItemLevel> cards)
    {
        var cap = league.LevelCap();
        var capped = new Dictionary<int, PlayerItemLevel>(cards.Count);
        foreach (var (id, card) in cards)
        {
            capped[id] = LevelModel.DisplayLevel(card) > cap ? card.CappedTo(cap) : card;
        }
        return capped;
    }
}
