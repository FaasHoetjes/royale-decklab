namespace RoyaleDeckLab.Api.Models;

/// <summary>Log-odds a deck gains for each evo and each hero it fields.</summary>
public sealed record SpecialValues(double Evo, double Hero);
