using RoyaleDeckLab.Api.Models;

namespace RoyaleDeckLab.Api.Services;

internal static class CardVersionRules
{
    // Slot 1 takes an Evo, slot 2 a Hero, slot 3 either; caps are a safety net,
    // correct meta data already respects them.
    private const int MaxEvo = 2;
    private const int MaxHero = 2;
    private const int MaxSpecials = 3;

    // ~6% weaker per missing special version, compounding across the deck.
    internal const double MissingSpecialMultiplier = 0.94;

    internal static bool IsChampion(int cardId, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => cardMap.TryGetValue(cardId, out var card) && card.Rarity == Rarity.Champion;

    internal static List<CardVersion> WithChampionVersions(
        IReadOnlyList<int> cardIds,
        IReadOnlyList<CardVersion>? cardVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var raw = new Dictionary<int, CardVersionKind>();
        foreach (var v in cardVersions ?? [])
        {
            raw[v.CardId] = v.Version;
        }

        var result = new List<CardVersion>(cardIds.Count);
        foreach (var cardId in cardIds)
        {
            var version = IsChampion(cardId, cardMap)
                ? CardVersionKind.Hero
                : raw.GetValueOrDefault(cardId, CardVersionKind.Normal);
            result.Add(new CardVersion(cardId, version));
        }
        return result;
    }

    internal static IReadOnlyList<CardVersion>? CapEvolutions(IReadOnlyList<CardVersion>? cardVersions)
    {
        if (cardVersions is null)
        {
            return null;
        }

        var evo = 0;
        var hero = 0;
        var total = 0;
        var illegal = false;
        var capped = new List<CardVersion>(cardVersions.Count);
        foreach (var v in cardVersions)
        {
            if (v.Version == CardVersionKind.Normal)
            {
                capped.Add(v);
                continue;
            }
            var fitsType = v.Version == CardVersionKind.Evo ? evo < MaxEvo : hero < MaxHero;
            var hasRoomForSpecial = total < MaxSpecials;
            if (fitsType && hasRoomForSpecial)
            {
                if (v.Version == CardVersionKind.Evo)
                {
                    evo++;
                }
                else
                {
                    hero++;
                }
                total++;
                capped.Add(v);
            }
            else
            {
                illegal = true;
                capped.Add(new CardVersion(v.CardId, CardVersionKind.Normal));
            }
        }
        return illegal ? capped : cardVersions;
    }

    internal static IReadOnlyList<CardVersion>? PersonalizeVersions(
        IReadOnlyList<CardVersion>? cardVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (cardVersions is null)
        {
            return null;
        }

        var changed = false;
        var personalized = new List<CardVersion>(cardVersions.Count);
        foreach (var v in cardVersions)
        {
            if (v.Version == CardVersionKind.Normal || IsChampion(v.CardId, cardMap))
            {
                personalized.Add(v);
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var c) ? c.EvolutionLevel : 0;
            if (EvolutionBits.Owns(owned, v.Version))
            {
                personalized.Add(v);
                continue;
            }
            changed = true;
            personalized.Add(new CardVersion(v.CardId, CardVersionKind.Normal));
        }
        return changed ? personalized : cardVersions;
    }

    internal static IReadOnlyList<CardVersion>? UpgradeIntoFreeSlots(
        IReadOnlyList<CardVersion>? personalized,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (personalized is null || metaVersions is null)
        {
            return personalized;
        }

        var evo = 0;
        var hero = 0;
        foreach (var v in metaVersions)
        {
            if (v.Version == CardVersionKind.Evo)
            {
                evo++;
            }
            else if (v.Version == CardVersionKind.Hero)
            {
                hero++;
            }
        }
        var total = evo + hero;

        var changed = false;
        var upgraded = new List<CardVersion>(personalized.Count);
        for (var i = 0; i < personalized.Count; i++)
        {
            var v = personalized[i];
            if (v.Version != CardVersionKind.Normal || metaVersions[i].Version != CardVersionKind.Normal)
            {
                upgraded.Add(v);
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var c) ? c.EvolutionLevel : 0;
            if (EvolutionBits.OwnsHero(owned) && hero < MaxHero && total < MaxSpecials)
            {
                hero++;
                total++;
                changed = true;
                upgraded.Add(new CardVersion(v.CardId, CardVersionKind.Hero));
            }
            else if (EvolutionBits.OwnsEvo(owned) && evo < MaxEvo && total < MaxSpecials)
            {
                evo++;
                total++;
                changed = true;
                upgraded.Add(new CardVersion(v.CardId, CardVersionKind.Evo));
            }
            else
            {
                upgraded.Add(v);
            }
        }
        return changed ? upgraded : personalized;
    }

    private static bool SlotCanField(CardVersionKind version, int slotIndex)
        => version == CardVersionKind.Hero ? slotIndex is 1 or 2 : slotIndex is 0 or 2;

    /// <param name="Fit">Multiplier for the specials the meta deck plays that these slots leave unplayed.</param>
    /// <param name="AsMeta">Whether every special the meta deck plays is in a slot that fields it, so the deck is
    /// played the way its meta win rate was measured.</param>
    internal sealed record Placement(double Fit, bool AsMeta);

    internal static Placement PlacementFit(
        IReadOnlyList<int?> slots,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (metaVersions is null)
        {
            return new Placement(1, AsMeta: true);
        }

        var asMeta = true;
        var unplayed = 0;
        var playedAsMeta = new HashSet<int>();
        foreach (var v in metaVersions)
        {
            if (v.Version == CardVersionKind.Normal || IsChampion(v.CardId, cardMap))
            {
                continue;
            }
            var owned = cardMap.TryGetValue(v.CardId, out var card) ? card.EvolutionLevel : 0;
            var slot = IndexOf(slots, v.CardId);
            if (EvolutionBits.Owns(owned, v.Version) && slot >= 0 && SlotCanField(v.Version, slot))
            {
                playedAsMeta.Add(v.CardId);
                continue;
            }
            asMeta = false;
            // An unowned special is already priced in by the deck's own score.
            if (EvolutionBits.Owns(owned, v.Version))
            {
                unplayed++;
            }
        }

        // War battles where a deck swaps one special for another win as often as the usual setup (11k battles),
        // so only a special slot left without one costs anything.
        var substitutes = 0;
        for (var i = 0; i < Math.Min(slots.Count, SpecialSlots); i++)
        {
            if (slots[i] is int id && !playedAsMeta.Contains(id) && !IsChampion(id, cardMap) && FieldsASpecial(id, i, cardMap))
            {
                substitutes++;
            }
        }

        return new Placement(Math.Pow(MissingSpecialMultiplier, Math.Max(0, unplayed - substitutes)), asMeta);
    }

    private const int SpecialSlots = 3;

    /// <summary>The special slots the meta deck fills that the player's own evos and heroes among its cards can't.</summary>
    internal static int EmptySpecialSlots(
        IReadOnlyList<int> cardIds,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => Math.Max(0, MetaSpecials(cardIds, metaVersions, cardMap) - FillableSpecials(cardIds, cardMap));

    private static int MetaSpecials(
        IReadOnlyList<int> cardIds,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var specials = 0;
        foreach (var cardId in cardIds)
        {
            var isSpecial = IsChampion(cardId, cardMap) || VersionOf(metaVersions, cardId) != CardVersionKind.Normal;
            if (isSpecial)
            {
                specials++;
            }
        }
        return Math.Min(MaxSpecials, specials);
    }

    private static CardVersionKind VersionOf(IReadOnlyList<CardVersion>? versions, int cardId)
    {
        foreach (var v in versions ?? [])
        {
            if (v.CardId == cardId)
            {
                return v.Version;
            }
        }
        return CardVersionKind.Normal;
    }

    private static int FillableSpecials(IReadOnlyList<int> cardIds, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var evoOnly = 0;
        var heroOnly = 0;
        var either = 0;
        foreach (var cardId in cardIds)
        {
            var owned = cardMap.TryGetValue(cardId, out var card) ? card.EvolutionLevel : 0;
            var ownsHero = IsChampion(cardId, cardMap) || EvolutionBits.OwnsHero(owned);
            var ownsEvo = !IsChampion(cardId, cardMap) && EvolutionBits.OwnsEvo(owned);
            if (ownsEvo && ownsHero)
            {
                either++;
            }
            else if (ownsEvo)
            {
                evoOnly++;
            }
            else if (ownsHero)
            {
                heroOnly++;
            }
        }
        var evos = Math.Min(MaxEvo, evoOnly + either);
        var heroes = Math.Min(MaxHero, heroOnly + either);
        return Math.Min(MaxSpecials, Math.Min(evoOnly + heroOnly + either, evos + heroes));
    }

    private static int IndexOf(IReadOnlyList<int?> slots, int cardId)
    {
        for (var i = 0; i < slots.Count; i++)
        {
            if (slots[i] == cardId)
            {
                return i;
            }
        }
        return -1;
    }

    private static bool FieldsASpecial(int cardId, int slotIndex, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var owned = cardMap.TryGetValue(cardId, out var card) ? card.EvolutionLevel : 0;
        return (EvolutionBits.OwnsEvo(owned) && SlotCanField(CardVersionKind.Evo, slotIndex))
            || (EvolutionBits.OwnsHero(owned) && SlotCanField(CardVersionKind.Hero, slotIndex));
    }
}
