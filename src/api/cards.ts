import { API_BASE_URL } from '../constants/constants';
import dotenv from 'dotenv';

dotenv.config();

export interface CatalogCard {
    id: number;
    name: string;
    maxLevel: number;
    maxEvolutionLevel?: number;
    elixirCost?: number;
    rarity?: string;
    iconUrls?: {
        medium?: string;
        evolutionMedium?: string;
    };
}

export default class Cards {

    async getAllCards(): Promise<CatalogCard[]> {
        const response = await fetch(
            `${API_BASE_URL}/cards`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLASH_ROYALE_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { items: CatalogCard[] };
        // First cut: regular cards only, skip supportItems (tower troops).
        return data.items || [];
    }
}
