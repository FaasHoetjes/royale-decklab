// One-shot clean rebuild of the meta store + cache from real Clan War battles.
//
// Why this exists: the production rebuild MERGES freshly-fetched battles into the
// existing battle-store.json. This script instead rebuilds from a clean slate —
// fetch fresh war battles, dedup, aggregate, and write both production files
// (battle-store.json / meta-cache.json) directly. Use it to reset the store
// (e.g. after switching the battle source), not just to top it up. Mirrors
// server.ts persistAndAggregate (7-day window, epochStart 0) but skips the merge.
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import MetaBuilder from '../src/services/metaBuilder';
import dotenv from 'dotenv';

dotenv.config();

const BATTLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseBattleTime(battleTime: string): number {
    const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!m) return 0;
    const [, y, mo, d, h, mi, s] = m;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

async function main() {
    const builder = new MetaBuilder();
    const fresh = await builder.collectWarBattleRecords();
    if (fresh.length === 0) {
        console.error('Fetched 0 war battles — aborting so existing files are left intact.');
        process.exit(1);
    }

    // Dedup by key, exactly as the production merge does (server.ts). War is
    // especially prone to cross-perspective duplicates: top clans face each other
    // in river races, so the same physical game is logged by both sampled
    // players. Without this, those battles get counted twice.
    const byKey = new Map<string, typeof fresh[number]>();
    for (const record of fresh) {
        if (!byKey.has(record.key)) {
            byKey.set(record.key, record);
        }
    }
    const deduped = [...byKey.values()];

    const cutoff = Date.now() - BATTLE_WINDOW_MS;
    const kept = deduped.filter(r => parseBattleTime(r.battleTime) >= cutoff);

    writeFileSync(resolve('battle-store.json'), JSON.stringify({ battles: kept, epochStart: 0 }));

    const decks = builder.aggregateBattles(kept);
    writeFileSync(resolve('meta-cache.json'), JSON.stringify({ timestamp: Date.now(), decks }, null, 2));

    const illegal = decks.filter(d => (d.cardVersions ?? []).filter(v => v.version !== 'normal').length > 3).length;
    const distinctPlayers = new Set(kept.map(r => r.playerTag)).size;
    console.log(`\nRebuilt WAR meta: ${decks.length} decks from ${kept.length} battles ` +
        `(${fresh.length} fetched, ${fresh.length - deduped.length} dup keys merged; ${distinctPlayers} players).`);
    console.log(`Decks with >3 specials after rebuild: ${illegal} (expect 0).`);
}

main();
