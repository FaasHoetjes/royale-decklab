using RoyaleDeckLab.Api.Dtos;
using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

public static class PlayedCards
{
    /// <summary>The deck by card id, levels on the unified scale; null when it's empty or a card has no level.</summary>
    public static IReadOnlyList<CrownSeriesCard>? From(IReadOnlyList<CrBattleCard>? played)
    {
        if (played is null || played.Count == 0)
        {
            return null;
        }

        var cards = new List<CrownSeriesCard>(played.Count);
        foreach (var card in played)
        {
            if (card is not { Level: int level, MaxLevel: int maxLevel })
            {
                return null;
            }
            cards.Add(new CrownSeriesCard(card.Id, LevelModel.DisplayLevel(level, maxLevel), MetaBuilder.FieldedVersion(card)));
        }
        cards.Sort((a, b) => a.Id.CompareTo(b.Id));
        return cards;
    }
}
