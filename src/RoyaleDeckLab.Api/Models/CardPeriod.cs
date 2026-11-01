namespace RoyaleDeckLab.Api.Models;

/// <summary>One card's war battles in a period; a draw counts as half a win.</summary>
public sealed record CardTally(int CardId, int Games, double Wins, int EvoGames, int HeroGames);

/// <summary>Every card's tally over the battles from <see cref="StartMs"/> up to <see cref="EndMs"/>.</summary>
public sealed record CardPeriod(long StartMs, long EndMs, int Battles, IReadOnlyList<CardTally> Cards);
