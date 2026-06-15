import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Player from './api/player';
import Cards, { CatalogCard } from './api/cards';
import MetaBuilder from './services/metaBuilder';
import DeckAnalyzer from './services/deckAnalyzer';
import { DeckMeta, PlayerItemLevel } from './models/models';
import dotenv from 'dotenv';

dotenv.config();

const META_CACHE_PATH = resolve('meta-cache.json');
const CACHE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;

interface CacheData {
    timestamp: number;
    decks: DeckMeta[];
}

let metaCache: DeckMeta[] = [];
let lastCacheTime = 0;

// Lazily-fetched, in-memory cache of the full card catalog.
let cardCatalog: CatalogCard[] | null = null;

async function getCardCatalog(): Promise<CatalogCard[]> {
    if (cardCatalog) {
        return cardCatalog;
    }
    const cards = new Cards();
    cardCatalog = await cards.getAllCards();
    return cardCatalog;
}

async function loadOrBuildMetaCache(): Promise<DeckMeta[]> {
    const now = Date.now();

    try {
        const cacheContent = readFileSync(META_CACHE_PATH, 'utf-8');
        const cacheData = JSON.parse(cacheContent) as CacheData;

        if (now - cacheData.timestamp < CACHE_REFRESH_INTERVAL) {
            console.log('Loaded meta cache from disk');
            metaCache = cacheData.decks;
            lastCacheTime = cacheData.timestamp;
            return metaCache;
        }
    } catch (error) {
        console.log('No valid cache found');
    }

    try {
        console.log('Building meta database from API...');
        const metaBuilder = new MetaBuilder();
        const decks = await metaBuilder.buildMetaDatabase();

        const cacheData: CacheData = {
            timestamp: now,
            decks
        };

        writeFileSync(META_CACHE_PATH, JSON.stringify(cacheData, null, 2));
        console.log('Saved meta cache to disk');

        metaCache = decks;
        lastCacheTime = now;
        return metaCache;
    } catch (error) {
        console.error('\n⚠️  Failed to build meta database from API:', error);
        console.error('\nThe Clash Royale API requires tokens to be bound to a specific IP address.');
        console.error('To use live data, register your own API key at https://developer.clashroyale.com');
        console.error('and ensure it\'s bound to your machine\'s IP address.\n');

        console.log('Using empty meta database. Player searches will work but decks won\'t have meta scores.');
        metaCache = [];
        lastCacheTime = now;
        return metaCache;
    }
}

function createCardIdMap(playerCards: PlayerItemLevel[]): Map<number, PlayerItemLevel> {
    const map = new Map<number, PlayerItemLevel>();
    for (const card of playerCards) {
        map.set(card.id, card);
    }
    return map;
}

Bun.serve({
    port: 3000,
    async fetch(req) {
        const url = new URL(req.url);
        const pathname = url.pathname;

        if (pathname === '/api/meta/status') {
            const cacheAge = Date.now() - lastCacheTime;
            return Response.json({
                status: 'ok',
                deckCount: metaCache.length,
                cacheAgeMs: cacheAge,
                lastRefresh: new Date(lastCacheTime).toISOString()
            });
        }

        if (pathname === '/api/meta/refresh' && req.method === 'POST') {
            console.log('Force-refreshing meta cache...');
            const metaBuilder = new MetaBuilder();
            const decks = await metaBuilder.buildMetaDatabase();
            metaCache = decks;
            lastCacheTime = Date.now();

            const cacheData: CacheData = {
                timestamp: lastCacheTime,
                decks
            };
            writeFileSync(META_CACHE_PATH, JSON.stringify(cacheData, null, 2));

            return Response.json({ status: 'refreshed', deckCount: decks.length });
        }

        if (pathname === '/api/cards' && req.method === 'GET') {
            try {
                const catalog = await getCardCatalog();
                return Response.json({ cards: catalog });
            } catch (error) {
                console.error('Error fetching card catalog:', error);
                return Response.json(
                    { error: `Failed to fetch card catalog: ${error}` },
                    { status: 500 }
                );
            }
        }

        const collectionMatch = pathname.match(/^\/api\/player\/(.+)\/collection$/);
        if (collectionMatch && req.method === 'GET') {
            const playerTag = decodeURIComponent(collectionMatch[1]);

            try {
                const player = new Player(playerTag);
                const playerData = await player.getPlayerData();

                if (!playerData.cards) {
                    return Response.json(
                        { error: 'Player cards data not found in API response' },
                        { status: 400 }
                    );
                }

                const cards = playerData.cards.playerItemLevels || playerData.cards;
                const ownedCards = (cards as any[]).map((card: any) => ({
                    id: card.id,
                    name: card.name,
                    level: card.level,
                    maxLevel: card.maxLevel,
                    evolutionLevel: card.evolutionLevel,
                    elixirCost: card.elixirCost ?? card.elixerCost,
                    iconUrls: card.iconUrls
                }));

                return Response.json({
                    player: { tag: playerData.tag, name: playerData.name },
                    cards: ownedCards
                });
            } catch (error) {
                console.error('Error fetching player collection:', error);
                return Response.json(
                    { error: `Failed to fetch player collection: ${error}` },
                    { status: 500 }
                );
            }
        }

        const playerMatch = pathname.match(/^\/api\/player\/(.+)$/);
        if (playerMatch && req.method === 'GET') {
            const playerTag = decodeURIComponent(playerMatch[1]);

            try {
                const player = new Player(playerTag);
                const playerData = await player.getPlayerData();

                if (!playerData.cards) {
                    return Response.json(
                        { error: 'Player cards data not found in API response' },
                        { status: 400 }
                    );
                }

                const cards = playerData.cards.playerItemLevels || playerData.cards;
                const cardIdMap = createCardIdMap(cards);
                const deckAnalyzer = new DeckAnalyzer();

                const warDeckResult = deckAnalyzer.findBestWarDecks(
                    cards,
                    metaCache,
                    cardIdMap
                );

                return Response.json({
                    player: {
                        tag: playerData.tag,
                        name: playerData.name
                    },
                    warDecks: warDeckResult
                });
            } catch (error) {
                console.error('Error fetching player data:', error);
                return Response.json(
                    { error: `Failed to fetch player data: ${error}` },
                    { status: 500 }
                );
            }
        }

        return Response.json({ error: 'Not found' }, { status: 404 });
    },

    async error(error) {
        console.error('Server error:', error);
        return Response.json({ error: 'Internal server error' }, { status: 500 });
    }
});

console.log('Loading meta cache...');
await loadOrBuildMetaCache();
console.log('Server running on http://localhost:3000');
