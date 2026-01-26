import { API_BASE_URL } from '../constants/constants';
import dotenv from 'dotenv';
import { PlayerData } from '../models/models';

dotenv.config();

export default class Player {

    private playerTag: string;

    constructor(playerTag?: string) {
        this.playerTag = playerTag || '';
    }

    async getPlayerData(): Promise<PlayerData> {
        if (!this.playerTag) {
            throw new Error('Player tag is required');
        }

        const encodedTag = encodeURIComponent(this.playerTag);
        const response = await fetch(
            `${API_BASE_URL}/players/${encodedTag}`,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CLASH_ROYALE_API_KEY}`,
                    'Accept': 'application/json'
                }
            }
        );

        const player = await response.json() as PlayerData;
        return player;
    }
}