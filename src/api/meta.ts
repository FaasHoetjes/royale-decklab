import { API_BASE_URL } from '../constants/constants';
import dotenv from 'dotenv';

dotenv.config();

interface BattleCard {
    id: number;
    evolutionLevel?: number;
    /** "champion" marks a champion card, always fielded in the champion slot. */
    rarity?: string;
}

/** One round of a clan-war duel: the actual 8-card deck played that game. */
interface BattleRound {
    crowns: number;
    cards: BattleCard[];
}

interface BattleSide {
    tag?: string;
    name?: string;
    cards: BattleCard[];
    crowns: number;
    /** Present only on duels (riverRaceDuel): the per-game decks, best-of-3. */
    rounds?: BattleRound[];
}

interface Battle {
    type: string;
    battleTime: string;
    /** e.g. "Ranked1v1_NewArena", "CW_Battle_1v1", "CW_Duel_1v1". */
    gameMode?: { id?: number; name?: string };
    /** e.g. "collection" (standard war battle) or "warDeckPick" (duel). */
    deckSelection?: string;
    team: BattleSide[];
    opponent: BattleSide[];
}

export default class Meta {
    /**
     * Fetches the global Clan War leaderboard. This lists clans — we then pull
     * each clan's roster via getClanMemberTags to reach the players whose war
     * battle logs we sample. The top entries are the strongest war clans, so
     * their members give the highest-quality war-deck signal. Supports up to 1000
     * but the caller deliberately stays well below that (see MAX_WAR_CLANS) since
     * clan war-skill collapses fast past the top ~200.
     */
    async getTopWarClans(limit: number = 150): Promise<string[]> {
        const response = await fetch(
            `${API_BASE_URL}/locations/global/rankings/clanwars?limit=${limit}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLASH_ROYALE_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            const text = await response.text();
            console.error('API Error response:', text);
            throw new Error(`Failed to fetch war clan rankings: ${response.status}`);
        }

        const data = await response.json() as { items?: { tag?: string }[] };
        const items = data.items ?? [];
        return items.map(c => c.tag).filter((tag): tag is string => !!tag);
    }

    /**
     * Fetches a clan's current roster (up to 50 members) and returns their tags.
     * Throws on failure so the caller can decide whether to skip just this clan.
     */
    async getClanMemberTags(clanTag: string): Promise<string[]> {
        const encodedTag = encodeURIComponent(clanTag);
        const response = await fetch(
            `${API_BASE_URL}/clans/${encodedTag}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLASH_ROYALE_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch clan ${clanTag}: ${response.status}`);
        }

        const data = await response.json() as { memberList?: { tag?: string }[] };
        const members = data.memberList ?? [];
        return members.map(m => m.tag).filter((tag): tag is string => !!tag);
    }

    async getPlayerBattlelog(playerTag: string): Promise<Battle[]> {
        const encodedTag = encodeURIComponent(playerTag);
        const response = await fetch(
            `${API_BASE_URL}/players/${encodedTag}/battlelog`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLASH_ROYALE_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to fetch battle log for ${playerTag}: ${response.status}`);
        }

        const data = await response.json() as Battle[];
        return data;
    }
}
