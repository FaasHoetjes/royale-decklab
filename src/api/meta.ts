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
    async getTopPlayers(limit: number = 200): Promise<TopPlayer[]> {
        const token = process.env.CLASH_ROYALE_API_KEY;
        console.log('Token loaded:', token ? `${token.substring(0, 20)}...` : 'NOT SET');

        // Test with a different endpoint first
        const cardsResponse = await fetch(
            `${API_BASE_URL}/cards`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );
        console.log('Cards endpoint status:', cardsResponse.status);

        const response = await fetch(
            `${API_BASE_URL}/locations/global/rankings/players?limit=${limit}`,
            {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            }
        );

        console.log('API Response status:', response.status);

        if (!response.ok) {
            const text = await response.text();
            console.error('API Error response:', text);
            throw new Error(`Failed to fetch top players: ${response.status}`);
        }

        const data = await response.json() as any;
        console.log('Full API Response:', JSON.stringify(data));

        const items = data.items || data;
        if (!Array.isArray(items)) {
            console.error('Unexpected API response format:', typeof items);
            return [];
        }

        return items as TopPlayer[];
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
