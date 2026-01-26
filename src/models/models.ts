export interface PlayerData {
    tag: string;
    name: string;
    currentDeck: PlayerItemLevelList;
    currentDeckSupportCards: PlayerItemLevelList;
    cards: PlayerItemLevelList;
    supportCards: PlayerItemLevelList;
}

export interface PlayerItemLevelList {
    playerItemLevels: PlayerItemLevel[];
}

export interface PlayerItemLevel {
    id: number;
    rarity: Rarity;
    count: number;
    level: number;
    starLevel: number;
    evolutionLevel: number;
    used: boolean;
    name: string;
    maxLevel: number;
    elixerCost: number;
    maxEvolutionLevel: number;
}

export enum Rarity {
    COMMON = "common",
    RARE = "rare",
    EPIC = "epic",
    LEGENDARY = "legendary",
    CHAMPION = "champion"
}
