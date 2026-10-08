using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Tests;

public sealed class EvolutionBitsTests
{
    [Theory]
    [InlineData(0, false, false)]
    [InlineData(1, true, false)]
    [InlineData(2, false, true)]
    [InlineData(3, true, true)]
    public void DecodesEvoAndHero_AsIndependentBits(int evolutionLevel, bool evo, bool hero)
    {
        Assert.Equal(evo, EvolutionBits.OwnsEvo(evolutionLevel));
        Assert.Equal(hero, EvolutionBits.OwnsHero(evolutionLevel));
        Assert.Equal(evo, EvolutionBits.Owns(evolutionLevel, CardVersionKind.Evo));
        Assert.Equal(hero, EvolutionBits.Owns(evolutionLevel, CardVersionKind.Hero));
    }

    [Fact]
    public void AlwaysOwnsTheNormalVersion()
    {
        Assert.True(EvolutionBits.Owns(0, CardVersionKind.Normal));
    }
}
