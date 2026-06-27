// One-shot clean rebuild of the battle store from real Clan War battles.
//
// Why this exists: the production rebuild MERGES freshly-fetched battles into the
// existing store. This script instead rebuilds from a clean slate — it clears
// the store, fetches fresh war battles, and re-fills it (dedup + the 7-day
// window handled by BattleStore). Use it to reset the store (e.g. after
// switching the battle source), not just to top it up. The server re-aggregates
// the meta from the store on its next start.
import MetaBuilder from '../src/services/metaBuilder';
import BattleStore from '../src/db/battleStore';
import dotenv from 'dotenv';

dotenv.config();

const BATTLE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function main() {
    const builder = new MetaBuilder();
    const fresh = await builder.collectWarBattleRecords();
    if (fresh.length === 0) {
        console.error('Fetched 0 war battles — aborting so the existing store is left intact.');
        process.exit(1);
    }

    const store = new BattleStore();
    store.clear();
    // mergeBattles dedups on the primary key — war is especially prone to
    // cross-perspective duplicates (top clans face each other, so the same
    // physical game is logged by both sampled players).
    const added = store.mergeBattles(fresh);
    const pruned = store.prune(Date.now() - BATTLE_WINDOW_MS);
    store.setLastBuild(Date.now());

    const decks = builder.aggregateBattles(store.allBattles());
    const illegal = decks.filter(d => (d.cardVersions ?? []).filter(v => v.version !== 'normal').length > 3).length;
    const distinctPlayers = new Set(store.allBattles().map(r => r.playerTag)).size;
    console.log(`\nRebuilt WAR meta: ${decks.length} decks from ${store.count()} battles ` +
        `(${fresh.length} fetched, ${fresh.length - added} dup keys merged, ${pruned} pruned; ${distinctPlayers} players).`);
    console.log(`Decks with >3 specials after rebuild: ${illegal} (expect 0).`);
}

main();
