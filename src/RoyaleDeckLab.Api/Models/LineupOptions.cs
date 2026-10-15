namespace RoyaleDeckLab.Api.Models;

/// <summary>Player-chosen constraints on the generated war lineup. <see cref="Default"/> reproduces the unconstrained result.</summary>
public sealed record LineupOptions
{
    public const int MaxDecks = 4;
    public const int CardsPerDeck = 8;
    private const int MaxListedCards = 40;

    public static LineupOptions Default { get; } = new();

    public int DeckCount { get; init; } = MaxDecks;

    /// <summary>Lowest in-game (display) level allowed for any card in a generated deck; null = any.</summary>
    public int? MinLevel { get; init; }

    public IReadOnlySet<int> BannedCards { get; init; } = new HashSet<int>();

    /// <summary>Every one of these cards must appear in some deck of the lineup.</summary>
    public IReadOnlySet<int> RequiredCards { get; init; } = new HashSet<int>();

    /// <summary>Decks kept as-is; the remaining slots are optimized around their cards.</summary>
    public IReadOnlyList<int[]> LockedDecks { get; init; } = [];

    /// <summary>Parses the generator's query string: decks=3, minLevel=14, ban=1,2, require=3, lock=8 ids (repeatable).</summary>
    public static bool TryParse(
        string? decks, string? minLevel, string? ban, string? require, IReadOnlyList<string>? locks,
        out LineupOptions options, out string? error)
    {
        options = Default;
        error = null;

        var deckCount = MaxDecks;
        if (!string.IsNullOrWhiteSpace(decks) && (!int.TryParse(decks, out deckCount) || deckCount is < 1 or > MaxDecks))
        {
            error = $"decks must be 1 to {MaxDecks}";
            return false;
        }

        int? min = null;
        if (!string.IsNullOrWhiteSpace(minLevel))
        {
            if (!int.TryParse(minLevel, out var m) || m is < 1 or > LevelModel.MaxDisplayLevel)
            {
                error = $"minLevel must be 1 to {LevelModel.MaxDisplayLevel}";
                return false;
            }
            min = m;
        }

        if (!TryParseIds(ban, "ban", out var banned, out error) || !TryParseIds(require, "require", out var required, out error))
        {
            return false;
        }
        if (banned.Overlaps(required))
        {
            error = "a card can't be both banned and required";
            return false;
        }

        var locked = new List<int[]>();
        var lockedCards = new HashSet<int>();
        foreach (var raw in locks ?? [])
        {
            if (!TryParseIds(raw, "lock", out var ids, out error))
            {
                return false;
            }
            if (ids.Count != CardsPerDeck)
            {
                error = $"each locked deck needs {CardsPerDeck} different cards";
                return false;
            }
            if (ids.Overlaps(lockedCards))
            {
                error = "locked decks can't share cards";
                return false;
            }
            if (ids.Overlaps(banned))
            {
                error = "a locked deck uses a banned card";
                return false;
            }
            lockedCards.UnionWith(ids);
            locked.Add([.. ids.Order()]);
        }
        if (locked.Count > deckCount)
        {
            error = "more locked decks than decks requested";
            return false;
        }

        options = new LineupOptions
        {
            DeckCount = deckCount,
            MinLevel = min,
            BannedCards = banned,
            RequiredCards = required,
            LockedDecks = locked,
        };
        return true;
    }

    private static bool TryParseIds(string? raw, string name, out HashSet<int> ids, out string? error)
    {
        ids = [];
        error = null;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }
        foreach (var part in raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!int.TryParse(part, out var id) || id <= 0)
            {
                error = $"{name} must be a comma-separated list of card ids";
                return false;
            }
            ids.Add(id);
        }
        if (ids.Count > MaxListedCards)
        {
            error = $"{name} lists too many cards";
            return false;
        }
        return true;
    }
}
