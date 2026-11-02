namespace RoyaleDeckLab.Api.Services;

/// <summary>
/// The server's copy of classifyDeck, featuredCard and distinctDeckNames in client/src/lib/archetypes.ts, for share
/// images and the server-rendered pages.
/// Both sides are tested against Fixtures/deck-names.json, so a rule changed on one side fails until the
/// other matches.
/// </summary>
public static class DeckArchetypes
{
    private sealed record Deck(HashSet<string> Names, double Avg)
    {
        public bool Has(params string[] names) => names.All(Names.Contains);
        public bool HasAny(params IEnumerable<string> names) => names.Any(Names.Contains);
    }

    private sealed record Rule(
        string WinCondition,
        string[] Needs,
        string? Name = null,
        string? Style = null,
        Func<Deck, bool>? When = null,
        Func<Deck, string>? NameOf = null);

    private static readonly string[] BaitSupport = ["Princess", "Goblin Gang", "Dart Goblin", "Rascals", "Skeleton Barrel", "Spear Goblins", "Bats"];
    private static readonly string[] BridgeSupport = ["Battle Ram", "Bandit", "Royal Ghost", "Dark Prince", "Prince", "Elite Barbarians", "Ram Rider"];
    private static readonly string[] BeatdownTanks = ["Golem", "Lava Hound", "Electro Giant", "Giant", "Goblin Giant"];

    private static readonly Rule[] Rules =
    [
        new("Lava Hound", ["Lava Hound", "Balloon"], Name: "Lava Loon", Style: "Beatdown"),
        new("Lava Hound", ["Lava Hound"], Style: "Beatdown"),
        new("Golem", ["Golem"], Name: "Golem Beatdown", Style: "Beatdown"),
        new("Electro Giant", ["Electro Giant"], Style: "Beatdown"),
        new("Goblin Giant", ["Goblin Giant", "Sparky"], Name: "Goblin Giant Sparky", Style: "Beatdown"),
        new("Goblin Giant", ["Goblin Giant"], Style: "Beatdown"),
        new("Giant", ["Giant", "Graveyard"], Name: "Giant Graveyard", Style: "Beatdown"),
        new("Giant", ["Giant"], Name: "Giant Beatdown", Style: "Beatdown"),
        new("Royal Giant", ["Royal Giant", "Fisherman"], Name: "Royal Giant Fisherman"),
        new("Royal Giant", ["Royal Giant"]),
        new("Elixir Golem", ["Elixir Golem"]),
        new("Rune Giant", ["Rune Giant"]),
        new("X-Bow", ["X-Bow"], Style: "Siege", NameOf: d => d.Avg <= 3.2 ? "X-Bow Cycle" : "X-Bow Siege"),
        new("Mortar", ["Mortar"], Name: "Mortar Bait", Style: "Siege", When: d => d.HasAny(BaitSupport)),
        new("Mortar", ["Mortar"], Style: "Siege"),
        new("Graveyard", ["Graveyard"], Name: "Splashyard", Style: "Control",
            When: d => d.HasAny("Baby Dragon", "Ice Wizard") && d.HasAny("Tornado", "Poison")),
        new("Graveyard", ["Graveyard", "Freeze"], Name: "Graveyard Freeze"),
        new("Graveyard", ["Graveyard"]),
        new("Hog Rider", ["Hog Rider", "Musketeer", "Cannon", "Ice Golem"], Name: "Hog 2.6", Style: "Cycle"),
        new("Hog Rider", ["Hog Rider", "Earthquake"], Name: "Hog EQ"),
        new("Hog Rider", ["Hog Rider"]),
        new("Royal Hogs", ["Royal Hogs", "Royal Recruits"], Name: "Royal Hogs Recruits", Style: "Bridge Spam"),
        new("Royal Hogs", ["Royal Hogs", "Earthquake"], Name: "Royal Hogs EQ"),
        new("Royal Hogs", ["Royal Hogs"]),
        new("Balloon", ["Balloon", "Lumberjack"], Name: "Lumberloon"),
        new("Balloon", ["Balloon", "Freeze"], Name: "Balloon Freeze"),
        new("Balloon", ["Balloon"]),
        new("Goblin Barrel", ["Goblin Barrel"], Name: "Log Bait", Style: "Bait",
            When: d => d.Has("Princess") || d.HasAny("Goblin Gang", "Dart Goblin", "Rascals")),
        new("Goblin Barrel", ["Goblin Barrel"], Style: "Bait"),
        new("Goblin Drill", ["Goblin Drill"]),
        new("P.E.K.K.A", ["P.E.K.K.A"], Name: "PEKKA Bridge Spam", Style: "Bridge Spam", When: d => d.HasAny(BridgeSupport)),
        new("Miner", ["Mega Knight", "Miner"], Name: "Mega Knight Miner"),
        new("Wall Breakers", ["Mega Knight", "Wall Breakers"], Name: "Mega Knight Wall Breakers"),
        new("Miner", ["Miner", "Wall Breakers"], Name: "Miner Wall Breakers"),
        new("Miner", ["Miner", "Poison"], Name: "Miner Poison", Style: "Control"),
        new("Miner", ["Miner"]),
        new("Ram Rider", ["Ram Rider"], Style: "Bridge Spam"),
        new("Battle Ram", ["Battle Ram"], Name: "Bridge Spam", Style: "Bridge Spam",
            When: d => d.HasAny(BridgeSupport.Where(c => c != "Battle Ram").Append("Giant Skeleton"))),
        new("Battle Ram", ["Battle Ram"]),
        new("Wall Breakers", ["Wall Breakers"]),
        new("Skeleton Barrel", ["Skeleton Barrel"], Name: "Skeleton Barrel Bait", Style: "Bait",
            When: d => d.HasAny(BaitSupport.Where(c => c != "Skeleton Barrel").Append("Skeleton Army"))),
        new("Skeleton Barrel", ["Skeleton Barrel"]),
        new("Three Musketeers", ["Three Musketeers"]),
        new("Sparky", ["Sparky"]),
        new("P.E.K.K.A", ["P.E.K.K.A"]),
        new("Mega Knight", ["Mega Knight"]),
    ];

    /// <summary>The deck's name, e.g. "Hog 2.6" or "Graveyard Cycle", and the card it's built around.</summary>
    public static (string Name, string? WinCondition) Classify(IReadOnlyList<(string Name, int? ElixirCost)> cards)
    {
        var deck = new Deck(
            cards.Select(c => c.Name).ToHashSet(),
            cards.Count == 0 ? 0 : cards.Sum(c => (double)(c.ElixirCost ?? 0)) / cards.Count);
        var rule = Rules.FirstOrDefault(r => deck.Has(r.Needs) && (r.When?.Invoke(deck) ?? true));
        if (rule is null)
        {
            return ($"{StyleByElixir(deck)} deck", null);
        }
        var name = rule.NameOf?.Invoke(deck) ?? rule.Name ?? $"{rule.WinCondition} {rule.Style ?? StyleByElixir(deck)}";
        return (name, rule.WinCondition);
    }

    /// <summary>
    /// Names for decks shown together, matching distinctDeckNames: a name two decks share gets the priciest card
    /// only that deck runs, e.g. "Log Bait · Inferno Tower".
    /// </summary>
    public static IReadOnlyList<string> DistinctNames(IReadOnlyList<IReadOnlyList<(string Name, int? ElixirCost)>> decks)
    {
        var classified = decks.Select(cards => (Cards: cards, Classified: Classify(cards))).ToList();
        return classified.Select((deck, i) =>
        {
            var (name, winCondition) = deck.Classified;
            var twins = classified.Where((other, j) => j != i && other.Classified.Name == name).Select(other => other.Cards).ToList();
            if (twins.Count == 0)
            {
                return name;
            }
            static bool Runs(IReadOnlyList<(string Name, int? ElixirCost)> cards, string card) => cards.Any(c => c.Name == card);
            var candidates = deck.Cards.Where(c => c.Name != winCondition).ToList();
            var own = candidates.Where(c => twins.All(t => !Runs(t, c.Name))).ToList();
            var tell = (own.Count > 0 ? own : candidates.Where(c => twins.Any(t => !Runs(t, c.Name))))
                .OrderByDescending(c => c.ElixirCost ?? 0)
                .Select(c => c.Name)
                .FirstOrDefault();
            return tell is null ? name : $"{name} · {tell}";
        }).ToList();
    }

    /// <summary>Index of the card to show for a deck: its win condition, or its most expensive card.</summary>
    public static int FeaturedIndex(IReadOnlyList<(string Name, int? ElixirCost)> cards)
    {
        var (_, winCondition) = Classify(cards);
        var index = cards.ToList().FindIndex(c => c.Name == winCondition);
        if (index >= 0)
        {
            return index;
        }
        return cards.Select((c, i) => (c.ElixirCost ?? 0, i)).OrderByDescending(c => c.Item1).Select(c => c.i).FirstOrDefault();
    }

    private static string StyleByElixir(Deck deck)
        => deck.HasAny(BeatdownTanks) && deck.Avg >= 3.8 ? "Beatdown" : deck.Avg <= 3.2 ? "Cycle" : "Control";
}
