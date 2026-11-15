using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;
using RoyaleDeckLab.Api.Services;

namespace RoyaleDeckLab.Api.Tests;

public sealed class FieldedVersionTests
{
    [Theory]
    [InlineData(null, CardVersionKind.Normal)]
    [InlineData(0, CardVersionKind.Normal)]
    [InlineData(1, CardVersionKind.Evo)]
    [InlineData(2, CardVersionKind.Hero)]
    [InlineData(3, CardVersionKind.Normal)]
    public void ReadsTheLevelAsTheVersionPlayed(int? evolutionLevel, CardVersionKind expected)
    {
        Assert.Equal(expected, MetaBuilder.FieldedVersion(new CrBattleCard(26000000, evolutionLevel, "common", Level: 14, MaxLevel: 14)));
    }

    [Fact]
    public void ChampionsAreAlwaysHeroes()
    {
        Assert.Equal(CardVersionKind.Hero, MetaBuilder.FieldedVersion(new CrBattleCard(26000072, null, "champion", Level: 14, MaxLevel: 14)));
    }
}
