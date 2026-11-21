namespace RoyaleDeckLab.Api.Models;

/// <summary>One set of Evos and Heroes a deck has been played with, and its record, weighted like the deck's.</summary>
public sealed record SpecialSetup(IReadOnlyList<CardVersion> Specials, double Games, double Wins);

/// <summary>How much more often each card wins as an Evo or Hero than as itself, across one meta's battles.</summary>
public sealed class SpecialGains(IReadOnlyDictionary<(int CardId, CardVersionKind Version), double> gains)
{
    public double Of(int cardId, CardVersionKind version) => gains.GetValueOrDefault((cardId, version));
}
