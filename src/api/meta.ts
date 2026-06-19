import { API_BASE_URL } from '../constants/constants';
import dotenv from 'dotenv';

dotenv.config();

interface TopPlayer {
    tag: string;
    name: string;
}

interface Battle {
    type: string;
    battleTime: string;
    team: Array<{
        tag: string;
        name: string;
        cards: Array<{ id: number; evolutionLevel?: number }>;
        crowns: number;
    }>;
    opponent: Array<{
        tag: string;
        crowns: number;
    }>;
}

export default class Meta {
    /**
     * Fetches the global Path of Legend leaderboard from the official Clash
     * Royale API. PoL is the current top-ladder, so its top entries are exactly
     * the high-skill players whose battle logs we want to sample. This endpoint
     * returns up to 1000 entries in a single call.
     */
    async getTopPlayers(limit: number = 1000): Promise<TopPlayer[]> {
        const response = await fetch(
            `${API_BASE_URL}/locations/global/pathoflegend/players?limit=${limit}`,
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
            throw new Error(`Failed to fetch top players: ${response.status}`);
        }

        const data = await response.json() as { items?: TopPlayer[] };
        const items = data.items ?? [];
        if (!Array.isArray(items)) {
            console.error('Unexpected API response format:', typeof items);
            return [];
        }

        return items;
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
