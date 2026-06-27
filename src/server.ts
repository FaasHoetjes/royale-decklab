import Player from './api/player';
import Cards, { CatalogCard } from './api/cards';
import MetaBuilder from './services/metaBuilder';
import DeckAnalyzer from './services/deckAnalyzer';
import BattleStore from './db/battleStore';
import { DeckMeta, PlayerItemLevel } from './models/models';
import dotenv from 'dotenv';

dotenv.config();

// Aggregated meta is considered fresh enough to serve on startup for this long.
const CACHE_REFRESH_INTERVAL = 24 * 60 * 60 * 1000;
// How often the background job rebuilds the meta database while the server is up.
// The battlelog API only exposes each player's last ~25 games; at ~5 min/game
// that window takes a couple of hours of play to fully turn over, so refreshing
// faster than this just re-reads battles we already have.
const BACKGROUND_REFRESH_INTERVAL = 2 * 60 * 60 * 1000;

// Rolling window of raw battles, persisted in SQLite. Each refresh merges new
// battles in (deduped on the primary key) and prunes anything older than the
// window, so per-deck samples accumulate over time instead of resetting to one
// fetch's worth on every rebuild.
const BATTLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const store = new BattleStore();

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

/**
 * The oldest battleTime that still counts: the later of the rolling-window edge
 * and the patch boundary. Setting an epoch after a balance update immediately
 * excludes everything from before it.
 */
function effectiveCutoff(): number {
    return Math.max(Date.now() - BATTLE_WINDOW_MS, metaEpochStart);
}

/**
 * Re-aggregates the in-memory meta cache from the battles currently in the
 * store, after pruning anything past the effective cutoff. Pure DB + CPU, no
 * network — shared by startup-from-cache, the epoch endpoint, and the tail of a
 * full rebuild. Because request handlers read `metaCache` at request time, any
 * player who generates decks after this returns automatically gets the fresh
 * data. Does NOT advance the stored last-build time (that marks the last
 * successful *fetch*); a fetching caller sets it before calling here.
 */
function aggregateFromStore(reason: string): DeckMeta[] {
    const cutoff = effectiveCutoff();
    const pruned = store.prune(cutoff);
    const battles = store.allBattles();

    const decks = new MetaBuilder().aggregateBattles(battles);
    metaCache = decks;
    lastCacheTime = store.getLastBuild();
    console.log(
        `Meta ${reason}: ${decks.length} decks from ${battles.length} battles ` +
        `(pruned ${pruned}, cutoff ${new Date(cutoff).toISOString()})`
    );
    return decks;
}

/**
 * Rebuilds the meta database from a fresh fetch, then swaps it into the
 * in-memory cache.
 *
 * The rebuild fetches a new batch of battles, merges them into the rolling
 * store (the store dedups on the primary key and the prune trims the window),
 * and re-aggregates the whole store — so deck samples grow across refreshes
 * rather than resetting.
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
        const fresh = await new MetaBuilder().collectWarBattleRecords();

        // An empty fetch means the scrape/API is down. Keep the existing store
        // and cache rather than wiping good data with nothing.
        if (fresh.length === 0) {
            console.warn(`Meta rebuild (${reason}): fetched 0 battles, keeping existing cache`);
            return metaCache;
        }

        // Merge fresh battles into the rolling store (dedup is the primary key),
        // then mark this as the latest successful fetch before re-aggregating.
        const added = store.mergeBattles(fresh);
        store.setLastBuild(Date.now());
        const decks = aggregateFromStore(`rebuild (${reason})`);
        console.log(`  └ +${added} new this fetch, ${fresh.length} fetched, ${store.count()} kept after cutoff`);
        return decks;
    } catch (error) {
        console.error(`Meta rebuild (${reason}) failed, keeping existing cache:`, error);
        return metaCache;
    } finally {
        isBuilding = false;
    }
}

async function loadOrBuildMetaCache(): Promise<DeckMeta[]> {
    const lastBuild = store.getLastBuild();
    const now = Date.now();

    // Fresh enough and we have battles on hand — aggregate from the store
    // without hitting the API (the background refresh keeps it current).
    if (lastBuild > 0 && now - lastBuild < CACHE_REFRESH_INTERVAL && store.count() > 0) {
        console.log('Meta cache fresh; aggregating from stored battles');
        return aggregateFromStore('startup (cached)');
    }

    // Stale or empty — rebuild from a fresh fetch. If that comes back empty
    // (API down) but we still have stored battles, aggregate those so a player
    // search isn't left with an empty meta.
    console.log('Meta cache stale or missing, rebuilding...');
    const decks = await rebuildMetaCache('startup');
    if (decks.length === 0 && store.count() > 0) {
        console.warn('Rebuild fetched nothing (API down?); aggregating from stored battles instead.');
        return aggregateFromStore('startup (fallback)');
    }
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

// Exact-deck lookup index for the War Deck Builder: maps a deck's sorted-card-id
// key to its meta entry, so a hand-built deck can be matched against the meta in
// O(1). Rebuilt lazily whenever the meta cache changes (keyed on lastCacheTime),
// so it never goes stale after a background refresh and costs nothing until the
// builder first asks for a score.
let metaIndex: Map<string, DeckMeta> = new Map();
let metaIndexTime = -1;

/** The sorted-card-id key used to match a deck against the meta index. */
function deckKey(cardIds: number[]): string {
    return [...cardIds].sort((a, b) => a - b).join(',');
}

function getMetaIndex(): Map<string, DeckMeta> {
    if (metaIndexTime !== lastCacheTime) {
        const index = new Map<string, DeckMeta>();
        for (const deck of metaCache) {
            index.set(deckKey(deck.cardIds), deck);
        }
        metaIndex = index;
        metaIndexTime = lastCacheTime;
    }
    return metaIndex;
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
            store.setEpochStart(ts);
            const decks = aggregateFromStore('epoch update');
            return Response.json({
                status: 'epoch-set',
                epochStart: new Date(ts).toISOString(),
                deckCount: decks.length,
                battlesKept: store.count()
            });
        }

        if (pathname === '/api/best-decks' && req.method === 'GET') {
            try {
                const catalog = await getCardCatalog();
                const cardMap = new Map<number, CatalogCard>();
                for (const card of catalog) {
                    cardMap.set(card.id, card);
                }

                const BEST_DECKS_POPULARITY_PRIOR = 8;
                const BEST_DECKS_MIN_PLAYERS = 5;

                const scoreMetaDeck = (deck: DeckMeta): number => {
                    const p = deck.players;
                    const pop = p === undefined ? 1 : (p <= 0 ? 0 : p / (p + BEST_DECKS_POPULARITY_PRIOR));
                    return (deck.confidence ?? deck.winRate) * pop;
                };

                // Two near-identical decks (e.g. the same build with one card
                // swapped) share this many or more of their 8 cards. Decks at or
                // above this overlap are treated as the same archetype.
                const ARCHETYPE_SHARED_CARDS = 6;
                // A given deck (archetype) may appear in at most this many of the
                // shown sets — stops one elite deck from dominating every set.
                const MAX_DECK_REUSE = 2;
                // The set search only ever pulls from the strongest decks, so cap
                // the working pool once we have plenty of distinct archetypes.
                const ARCHETYPE_POOL_SIZE = 150;

                const scored = metaCache
                    .filter(d => d.players === undefined || d.players >= BEST_DECKS_MIN_PLAYERS)
                    .map(d => ({ deck: d, score: scoreMetaDeck(d) }))
                    .sort((a, b) => b.score - a.score);

                // Collapse near-duplicate decks into archetypes: walking strongest
                // first, keep a deck only if it shares fewer than ARCHETYPE_SHARED_CARDS
                // cards with every deck already kept. This drops the "same deck, one
                // card swapped" clones that otherwise flood the set list.
                const eligible: typeof scored = [];
                for (const cand of scored) {
                    const cardSet = new Set<number>(cand.deck.cardIds);
                    const isVariant = eligible.some(kept => {
                        let shared = 0;
                        for (const id of kept.deck.cardIds) if (cardSet.has(id)) shared++;
                        return shared >= ARCHETYPE_SHARED_CARDS;
                    });
                    if (!isVariant) eligible.push(cand);
                    if (eligible.length >= ARCHETYPE_POOL_SIZE) break;
                }

                // Build up to 10 diverse sets in one budget-aware pass. The reuse
                // budget must be enforced *while filling* each set, not just when
                // selecting finished sets: every set is greedy-filled from the top
                // of the list, so without the budget the same elite decks land in
                // every candidate set and there's nothing diverse left to choose
                // from. Once a deck has appeared in MAX_DECK_REUSE chosen sets it's
                // no longer an available filler, which forces fresh decks into the
                // later sets instead of reshuffling the same few.
                const deckKeyOf = (p: typeof eligible[number]) => p.deck.cardIds.join(',');
                const deckUse = new Map<string, number>();
                const seen = new Set<string>();
                const top: Array<{ decks: typeof eligible[number][]; totalScore: number }> = [];

                const overBudget = (p: typeof eligible[number]) =>
                    (deckUse.get(deckKeyOf(p)) ?? 0) >= MAX_DECK_REUSE;

                const buildSets = (enforceBudget: boolean) => {
                    for (let i = 0; i < eligible.length && top.length < 10; i++) {
                        const seed = eligible[i];
                        if (enforceBudget && overBudget(seed)) continue;

                        const usedCards = new Set<number>(seed.deck.cardIds);
                        const picked = [seed];
                        for (const candidate of eligible) {
                            if (picked.length >= 4) break;
                            if (candidate === seed) continue;
                            if (enforceBudget && overBudget(candidate)) continue;
                            if (candidate.deck.cardIds.some(id => usedCards.has(id))) continue;
                            candidate.deck.cardIds.forEach(id => usedCards.add(id));
                            picked.push(candidate);
                        }
                        if (picked.length < 4) continue;

                        const key = picked.map(deckKeyOf).sort().join('|');
                        if (seen.has(key)) continue;
                        seen.add(key);

                        picked.forEach(p => deckUse.set(deckKeyOf(p), (deckUse.get(deckKeyOf(p)) ?? 0) + 1));
                        top.push({ decks: picked, totalScore: picked.reduce((s, p) => s + p.score, 0) });
                    }
                };

                buildSets(true);
                // Thin/narrow meta: if the reuse budget couldn't yield 10 distinct
                // sets, relax it and top up with the best remaining disjoint sets.
                if (top.length < 10) buildSets(false);

                top.sort((a, b) => b.totalScore - a.totalScore);

                const result = top.map(set => ({
                    decks: set.decks.map(s => {
                        const rawVersions = new Map((s.deck.cardVersions ?? []).map(v => [v.cardId, v.version] as const));
                        const cardVersions = s.deck.cardIds.map(cardId => {
                            const catalogCard = cardMap.get(cardId);
                            const isChampion = catalogCard?.rarity?.toLowerCase() === 'champion';
                            const version: 'normal' | 'evo' | 'hero' =
                                isChampion ? 'hero' : (rawVersions.get(cardId) ?? 'normal');
                            return { cardId, version };
                        });
                        return {
                            cardIds: s.deck.cardIds,
                            winRate: s.deck.winRate,
                            confidence: s.deck.confidence ?? s.deck.winRate,
                            uses: s.deck.uses,
                            players: s.deck.players ?? 0,
                            pickRate: s.deck.pickRate ?? 0,
                            metaScore: s.score,
                            cardVersions,
                            cards: s.deck.cardIds
                                .map(id => {
                                    const c = cardMap.get(id);
                                    if (!c) return null;
                                    return {
                                        id: c.id,
                                        name: c.name,
                                        maxLevel: c.maxLevel,
                                        elixirCost: c.elixirCost,
                                        rarity: c.rarity,
                                        iconUrls: c.iconUrls,
                                    };
                                })
                                .filter((c): c is NonNullable<typeof c> => c !== null),
                        };
                    }),
                    totalScore: set.totalScore,
                }));

                return Response.json({ sets: result });
            } catch (error) {
                console.error('Error generating best decks:', error);
                return Response.json({ error: `Failed to generate best decks: ${error}` }, { status: 500 });
            }
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

        // Score the four decks a player is hand-building in the War Deck Builder.
        // The client sends the cards it has placed (with the player's levels +
        // owned evo/hero tier) and the four decks as card-id lists, so we never
        // re-hit the Clash Royale API here — scoring is a pure function of the
        // payload plus the in-memory meta cache, fast enough to call live as the
        // user edits. A deck that exactly matches a meta deck gets the real player
        // score (identical to the generator); any other deck gets a fieldability
        // score (level-based only), flagged isMeta:false so the UI can mark it.
        if (pathname === '/api/score-decks' && req.method === 'POST') {
            let body: any = {};
            try {
                body = await req.json();
            } catch {
                return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
            }

            const cards = Array.isArray(body?.cards) ? body.cards : [];
            const decks = Array.isArray(body?.decks) ? body.decks : [];
            const playerCards = cards as PlayerItemLevel[];
            const analyzer = new DeckAnalyzer();
            const index = getMetaIndex();

            const scored = (decks as Array<Array<number | null>>).map((deck) => {
                const cardIds = (deck ?? []).filter((id): id is number => id != null);
                if (cardIds.length === 0) {
                    return { score: null, isMeta: false } as const;
                }
                // Only a complete eight-card deck can match a meta deck; anything
                // shorter scores on the neutral prior.
                const meta = cardIds.length === 8 ? index.get(deckKey(cardIds)) : undefined;
                const result = analyzer.scoreBuilderDeck(playerCards, cardIds, meta);
                if (!result) {
                    return { score: null, isMeta: false } as const;
                }
                return {
                    score: result.score,
                    isMeta: result.isMeta,
                    winRate: result.winRate,
                    fieldability: result.fieldability,
                    players: result.players,
                };
            });

            const total = scored.reduce((sum, d) => sum + (d.score ?? 0), 0);
            return Response.json({ decks: scored, total });
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
metaEpochStart = store.getEpochStart();
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
