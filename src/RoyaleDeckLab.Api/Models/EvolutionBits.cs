namespace RoyaleDeckLab.Api.Models;

/// <summary>
/// The CR API's per-card <c>evolutionLevel</c> is a bitmask, not a tier: 1 = Evo unlocked,
/// 2 = Hero unlocked, 3 = both. Cards with both versions (Knight, Valkyrie, Musketeer, Wizard)
/// can own the Hero without the Evo.
/// </summary>
public static class EvolutionBits
{
    public const int Evo = 1;
    public const int Hero = 2;

    public static bool OwnsEvo(int evolutionLevel) => (evolutionLevel & Evo) != 0;

    public static bool OwnsHero(int evolutionLevel) => (evolutionLevel & Hero) != 0;

    public static bool Owns(int evolutionLevel, CardVersionKind version) => version switch
    {
        CardVersionKind.Evo => OwnsEvo(evolutionLevel),
        CardVersionKind.Hero => OwnsHero(evolutionLevel),
        _ => true,
    };
}
