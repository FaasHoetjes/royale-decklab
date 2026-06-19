import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import Player from './api/player';
import Cards, { CatalogCard } from './api/cards';
import MetaBuilder from './services/metaBuilder';
import DeckAnalyzer from './services/deckAnalyzer';
import { BattleRecord, DeckMeta, PlayerItemLevel } from './models/models';
import dotenv from 'dotenv';

dotenv.config();

const META_CACHE_PATH = resolve('meta-cache.json');
// Aggregated meta is considered fresh enough to serve on startup for this long.
const CACHE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
// How often the background job rebuilds the meta database while the server is up.
// The battlelog API only exposes each player's last ~25 games; at ~5 min/game
// that window takes a couple of hours of play to fully turn over, so refreshing
// faster than this just re-reads battles we already have.
const BACKGROUND_REFRESH_INTERVAL = 2 * 60 * 60 * 1000;

// Rolling store of raw battles. Each refresh merges new battles in (deduped) and
// prunes anything older than the window, so per-deck samples accumulate over
// time instead of resetting to one fetch's worth on every rebuild.
const BATTLE_STORE_PATH = resolve('battle-store.json');
const BATTLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheData {
    timestamp: number;
    decks: DeckMeta[];
}

interface BattleStore {
    battles: BattleRecord[];
    // Patch boundary (epoch ms). Battles before this are excluded from
    // aggregation even if they fall inside the rolling window, so a balance
    // update's pre-patch data stops skewing win rates the moment it's set.
    epochStart?: number;
}

let metaCache: DeckMeta[] = [];
let lastCacheTime = 0;
// Guards against overlapping builds: a build takes a while (leaderboard fetch +
// ~1000 battle logs), longer than nothing but we never want two running at once.
let isBuilding = false;
// Patch boundary, mirrored in memory and persisted to the battle store so it
// survives restarts. 0 = no boundary set; only the rolling window applies.
let metaEpochStart = 0;

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

function loadBattleStore(): BattleStore {
    try {
        const content = readFileSync(BATTLE_STORE_PATH, 'utf-8');
        const data = JSON.parse(content) as BattleStore;
        return { battles: data.battles ?? [], epochStart: data.epochStart ?? 0 };
    } catch {
        return { battles: [], epochStart: 0 };
    }
}

/**
 * Converts an API battleTime ("20240617T120000.000Z") to epoch ms. Returns 0 on
 * an unparseable value so such records sort as ancient and get pruned out.
 */
function parseBattleTime(battleTime: string): number {
    const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!m) {
        return 0;
    }
    const [, year, month, day, hour, min, sec] = m;
    return Date.UTC(+year, +month - 1, +day, +hour, +min, +sec);
}

/**
 * The oldest battleTime that still counts: the later of the rolling-window edge
 * and the patch boundary. Setting an epoch after a balance update immediately
 * excludes everything from before it.
 */
function effectiveCutoff(): number {
    return Math.max(Date.now() - BATTLE_WINDOW_MS, metaEpochStart);
}

/**
 * Prunes battles to the effective cutoff, persists the store and aggregate, and
 * atomically swaps the new decks into the in-memory cache. Shared by the full
 * rebuild (after fetching) and the epoch endpoint (which re-aggregates the
 * existing store without re-fetching). No network — safe to call synchronously.
 */
function persistAndAggregate(battles: BattleRecord[], reason: string): { decks: DeckMeta[]; kept: number } {
    const cutoff = effectiveCutoff();
    const kept = battles.filter(r => parseBattleTime(r.battleTime) >= cutoff);

    const store: BattleStore = { battles: kept, epochStart: metaEpochStart };
    writeFileSync(BATTLE_STORE_PATH, JSON.stringify(store));

    const decks = new MetaBuilder().aggregateBattles(kept);
    const now = Date.now();
    const cacheData: CacheData = { timestamp: now, decks };
    writeFileSync(META_CACHE_PATH, JSON.stringify(cacheData, null, 2));

    metaCache = decks;
    lastCacheTime = now;
    console.log(
        `Meta ${reason}: ${decks.length} decks from ${kept.length}/${battles.length} battles ` +
        `(cutoff ${new Date(cutoff).toISOString()})`
    );
    return { decks, kept: kept.length };
}

/**
 * Rebuilds the meta database, then atomically swaps it into the in-memory cache
 * and persists it. Because request handlers read `metaCache` at request time,
 * any player who generates decks after this resolves automatically gets the
 * fresh data.
 *
 * The rebuild fetches a new batch of battles, merges them into the rolling
 * battle store (dedup by key, prune to the effective cutoff), and re-aggregates
 * the whole store — so deck samples grow across refreshes rather than resetting.
 *
 * Returns the new deck list, or the existing cache unchanged if a build is
 * already in flight, the fetch comes back empty, or the build fails.
 */
async function rebuildMetaCache(reason: string): Promise<DeckMeta[]> {
    if (isBuilding) {
        console.log(`Meta rebuild (${reason}) skipped: a build is already running`);
        return metaCache;
    }

    isBuilding = true;
    try {
        console.log(`Rebuilding meta cache (${reason})...`);
        const metaBuilder = new MetaBuilder();
        const fresh = await metaBuilder.collectBattleRecords();

        // An empty fetch means the scrape/API is down. Keep the existing store
        // and cache rather than wiping good data with nothing.
        if (fresh.length === 0) {
            console.warn(`Meta rebuild (${reason}): fetched 0 battles, keeping existing cache`);
            return metaCache;
        }

        // Merge fresh battles into the rolling store, deduping by key.
        const byKey = new Map<string, BattleRecord>();
        for (const record of loadBattleStore().battles) {
            byKey.set(record.key, record);
        }
        let added = 0;
        for (const record of fresh) {
            if (!byKey.has(record.key)) {
                byKey.set(record.key, record);
                added++;
            }
        }

        const merged = [...byKey.values()];
        const { kept } = persistAndAggregate(merged, `rebuild (${reason})`);
        console.log(`  └ +${added} new this fetch, ${fresh.length} fetched, ${kept} kept after cutoff`);
        return metaCache;
    } catch (error) {
        console.error(`Meta rebuild (${reason}) failed, keeping existing cache:`, error);
        return metaCache;
    } finally {
        isBuilding = false;
    }
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

    // Stale or missing aggregate — rebuild from the rolling store plus a fresh
    // fetch. If that comes back empty (API/scrape down), fall back to whatever
    // we can still aggregate from the on-disk battle store.
    console.log('Meta cache stale or missing, rebuilding...');
    const decks = await rebuildMetaCache('startup');
    if (decks.length === 0) {
        console.error('\n⚠️  Could not build meta from the API.');
        console.error('The Clash Royale API requires tokens to be bound to a specific IP address.');
        console.error('Register your own key at https://developer.clashroyale.com bound to your IP.');
        console.error('Player searches still work; decks just won\'t have meta scores until data lands.\n');
    }
    return decks;
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
                lastRefresh: new Date(lastCacheTime).toISOString(),
                epochStart: metaEpochStart > 0 ? new Date(metaEpochStart).toISOString() : null
            });
        }

        if (pathname === '/api/meta/refresh' && req.method === 'POST') {
            if (isBuilding) {
                return Response.json(
                    { status: 'busy', message: 'A meta rebuild is already in progress' },
                    { status: 409 }
                );
            }
            const decks = await rebuildMetaCache('manual');
            return Response.json({ status: 'refreshed', deckCount: decks.length });
        }

        // Set the patch boundary after a balance update. Body: { "timestamp":
        // <ISO string | epoch ms | "now"> } — defaults to now if omitted. Drops
        // all pre-boundary battles and re-aggregates immediately (no re-fetch),
        // so post-patch numbers take over at once and rebuild confidence as
        // fresh games accumulate.
        if (pathname === '/api/meta/epoch' && req.method === 'POST') {
            if (isBuilding) {
                return Response.json(
                    { status: 'busy', message: 'A meta rebuild is already in progress' },
                    { status: 409 }
                );
            }

            let body: any = {};
            try {
                body = await req.json();
            } catch {
                body = {};
            }

            const raw = body?.timestamp;
            let ts: number;
            if (raw === undefined || raw === null || raw === 'now') {
                ts = Date.now();
            } else if (typeof raw === 'number') {
                ts = raw;
            } else {
                ts = Date.parse(String(raw));
                if (Number.isNaN(ts)) {
                    return Response.json(
                        { status: 'error', message: 'Invalid timestamp. Use an ISO date, epoch ms, or "now".' },
                        { status: 400 }
                    );
                }
            }

            metaEpochStart = ts;
            const { decks, kept } = persistAndAggregate(loadBattleStore().battles, 'epoch update');
            return Response.json({
                status: 'epoch-set',
                epochStart: new Date(ts).toISOString(),
                deckCount: decks.length,
                battlesKept: kept
            });
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

// Restore the patch boundary from the store so it survives restarts.
metaEpochStart = loadBattleStore().epochStart ?? 0;
if (metaEpochStart > 0) {
    console.log(`Patch boundary in effect: ${new Date(metaEpochStart).toISOString()}`);
}

console.log('Loading meta cache...');
await loadOrBuildMetaCache();

// Keep the meta database fresh in the background. Players who generate decks
// after each refresh pick up the new data automatically (request handlers read
// `metaCache` live). Overlap is prevented by the isBuilding guard, so this is
// safe even if a build runs long.
setInterval(() => {
    void rebuildMetaCache('background refresh');
}, BACKGROUND_REFRESH_INTERVAL);
console.log(`Background meta refresh scheduled every ${BACKGROUND_REFRESH_INTERVAL / 60000} min`);

console.log('Server running on http://localhost:3000');
