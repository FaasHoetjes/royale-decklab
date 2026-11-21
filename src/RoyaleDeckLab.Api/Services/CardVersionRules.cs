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

    // A slot left free by a special the player doesn't own is filled with one they do: fielding any special beats none.
    internal static IReadOnlyList<CardVersion>? UpgradeIntoFreeSlots(
        IReadOnlyList<CardVersion>? personalized,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (personalized is null)
        {
            return null;
        }

        var evo = personalized.Count(v => v.Version == CardVersionKind.Evo);
        var hero = personalized.Count(v => v.Version == CardVersionKind.Hero);
        var total = evo + hero;

        var changed = false;
        var upgraded = new List<CardVersion>(personalized.Count);
        for (var i = 0; i < personalized.Count; i++)
        {
            var v = personalized[i];
            if (v.Version != CardVersionKind.Normal)
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

    internal static bool CanPlay(int cardId, CardVersionKind version, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => IsChampion(cardId, cardMap)
            || (cardMap.TryGetValue(cardId, out var card) && EvolutionBits.Owns(card.EvolutionLevel, version));

    /// <summary>
    /// The versions with each forced card played as asked. Where that leaves too many specials for the slots, another
    /// card's special goes, a Hero before an Evo since a Hero is worth less. Champions are always played as Heroes.
    /// </summary>
    internal static IReadOnlyList<CardVersion> ForceVersions(
        IReadOnlyList<CardVersion> versions,
        IReadOnlyDictionary<int, CardVersionKind> forced,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        if (!versions.Any(v => forced.ContainsKey(v.CardId) && !IsChampion(v.CardId, cardMap)))
        {
            return versions;
        }
        var result = versions
            .Select(v => forced.TryGetValue(v.CardId, out var kind) && !IsChampion(v.CardId, cardMap) ? new CardVersion(v.CardId, kind) : v)
            .ToList();
        int Count(CardVersionKind kind) => result.Count(v => v.Version == kind);
        bool Demote(CardVersionKind kind)
        {
            var i = result.FindLastIndex(v => v.Version == kind && !forced.ContainsKey(v.CardId) && !IsChampion(v.CardId, cardMap));
            if (i >= 0)
            {
                result[i] = new CardVersion(result[i].CardId, CardVersionKind.Normal);
            }
            return i >= 0;
        }
        while (Count(CardVersionKind.Evo) > MaxEvo && Demote(CardVersionKind.Evo))
        {
        }
        while (Count(CardVersionKind.Hero) > MaxHero && Demote(CardVersionKind.Hero))
        {
        }
        while (Count(CardVersionKind.Evo) + Count(CardVersionKind.Hero) > MaxSpecials
            && (Demote(CardVersionKind.Hero) || Demote(CardVersionKind.Evo)))
        {
        }
        return result;
    }

    /// <summary>How many Evos and Heroes the player fields, leaving out champions, which are always played.</summary>
    internal static (int Evos, int Heroes) SpecialsPlayed(
        IReadOnlyList<CardVersion> versions, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
        => (versions.Count(v => v.Version == CardVersionKind.Evo),
            versions.Count(v => v.Version == CardVersionKind.Hero && !IsChampion(v.CardId, cardMap)));

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

    // Fielding a different evo or hero than the meta deck's costs nothing; only the value the player can't field counts.
    internal static double MissingSpecialValue(
        IReadOnlyList<int> cardIds,
        IReadOnlyList<CardVersion>? metaVersions,
        IReadOnlyDictionary<int, PlayerItemLevel> cardMap,
        SpecialValues values)
    {
        var champions = cardIds.Count(id => IsChampion(id, cardMap));
        var metaEvos = cardIds.Count(id => !IsChampion(id, cardMap) && VersionOf(metaVersions, id) == CardVersionKind.Evo);
        var metaHeroes = cardIds.Count(id => !IsChampion(id, cardMap) && VersionOf(metaVersions, id) == CardVersionKind.Hero);
        var meta = BestFielded(metaEvos, metaHeroes, 0, champions, values);
        var own = OwnSpecials(cardIds, cardMap);
        var player = BestFielded(own.EvoOnly, own.HeroOnly, own.Either, champions, values);
        return Math.Max(0, meta - player);
    }

    private static double BestFielded(int evoOnly, int heroOnly, int either, int champions, SpecialValues values)
    {
        var best = 0.0;
        for (var evos = 0; evos <= MaxEvo; evos++)
        {
            for (var heroes = 0; heroes + champions <= MaxHero; heroes++)
            {
                var fits = evos + heroes + champions <= MaxSpecials
                    && evos <= evoOnly + either
                    && heroes <= heroOnly + either
                    && evos + heroes <= evoOnly + heroOnly + either;
                if (fits)
                {
                    best = Math.Max(best, evos * values.Evo + heroes * values.Hero);
                }
            }
        }
        return best;
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

    private static (int EvoOnly, int HeroOnly, int Either) OwnSpecials(
        IReadOnlyList<int> cardIds, IReadOnlyDictionary<int, PlayerItemLevel> cardMap)
    {
        var (evoOnly, heroOnly, either) = (0, 0, 0);
        foreach (var cardId in cardIds.Where(id => !IsChampion(id, cardMap)))
        {
            var owned = cardMap.TryGetValue(cardId, out var card) ? card.EvolutionLevel : 0;
            (evoOnly, heroOnly, either) = (EvolutionBits.OwnsEvo(owned), EvolutionBits.OwnsHero(owned)) switch
            {
                (true, true) => (evoOnly, heroOnly, either + 1),
                (true, false) => (evoOnly + 1, heroOnly, either),
                (false, true) => (evoOnly, heroOnly + 1, either),
                _ => (evoOnly, heroOnly, either),
            };
        }
        return (evoOnly, heroOnly, either);
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