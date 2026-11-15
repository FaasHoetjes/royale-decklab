using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Data;

public sealed class BattleEntity
{
    public string Key { get; set; } = "";

    public string BattleTime { get; set; } = "";

    public long BattleTimeMs { get; set; }

    public string PlayerTag { get; set; } = "";

    public int[] CardIds { get; set; } = [];

    public BattleResult Result { get; set; }

    public IReadOnlyList<CardVersion> CardVersions { get; set; } = [];
}

public sealed class CrownSeriesRoundEntity
{
    public string PlayerTag { get; set; } = "";

    public long BattleTimeMs { get; set; }

    public int Round { get; set; }

    public string OpponentTag { get; set; } = "";

    public BattleResult Result { get; set; }

    public IReadOnlyList<CrownSeriesCard> Cards { get; set; } = [];

    public int League { get; set; }

    public string EventTag { get; set; } = "";

    public int GameModeId { get; set; }
}

public sealed class MetaStateEntity
{
    public int Id { get; set; } = 1;
    public long EpochStartMs { get; set; }
    public long LastCrownSeriesPollMs { get; set; }
    public long PreviousEpochStartMs { get; set; }
    public long LastBuildMs { get; set; }
}

public sealed class CardPeriodEntity
{
    public long EndMs { get; set; }

    public long StartMs { get; set; }

    public int Battles { get; set; }

    public IReadOnlyList<CardTally> Cards { get; set; } = [];
}

public sealed class KnownCardVersionEntity
{
    public int CardId { get; set; }

    public CardVersionKind Version { get; set; }
}

public sealed class SeenPatchNoteEntity
{
    public string Key { get; set; } = "";
}

public sealed class BalanceUpdateEntity
{
    /// <summary>The day it went live, as yyyy-MM-dd.</summary>
    public string Day { get; set; } = "";

    public string NotesUrl { get; set; } = "";

    /// <summary>The changes as JSON: they're only ever read and written together.</summary>
    public string Changes { get; set; } = "[]";
}
