namespace RoyaleDeckLab.Api.Dtos;

public sealed record CardIconUrls(
    string? Medium,
    string? EvolutionMedium,
    string? HeroMedium)
{
    public IEnumerable<string> AllUrls() => new[] { Medium, EvolutionMedium, HeroMedium }.OfType<string>();
}
