// One-time migration: import the legacy battle-store.json into SQLite (meta.db).
//
// Run once after switching the backend from flat-file storage to BattleStore:
//   bun run scripts/migrate-battles-to-sqlite.ts
//
// It imports the accumulated 7-day battle sample (so the tighter Wilson bounds
// you've built up aren't lost) and carries over the patch boundary. The old
// meta-cache.json is NOT migrated — the server re-aggregates the meta from these
// battles on its next start. After a successful run you can delete both
// battle-store.json and meta-cache.json.
import { readFileSync } from 'fs';
import { resolve } from 'path';
import BattleStore from '../src/db/battleStore';
import { BattleRecord } from '../src/models/models';

const BATTLE_STORE_PATH = resolve('battle-store.json');

interface LegacyStore {
    battles?: BattleRecord[];
    epochStart?: number;
}

function main(): void {
    let raw: string;
    try {
        raw = readFileSync(BATTLE_STORE_PATH, 'utf-8');
    } catch {
        console.error(`No battle-store.json at ${BATTLE_STORE_PATH} — nothing to migrate.`);
        process.exit(1);
    }

    const data = JSON.parse(raw) as LegacyStore;
    const battles = data.battles ?? [];
    const epochStart = data.epochStart ?? 0;
    console.log(`Read ${battles.length} battles from battle-store.json (epochStart ${epochStart}).`);

    const store = new BattleStore();
    const before = store.count();
    const added = store.mergeBattles(battles);
    if (epochStart > 0) {
        store.setEpochStart(epochStart);
    }
    // Mark a build time so the first server start aggregates these battles
    // offline instead of being forced into an immediate (possibly failing) fetch.
    store.setLastBuild(Date.now());

    console.log(`Imported ${added} new battles (store had ${before}, now ${store.count()}).`);
    console.log('Done. Start the server normally — it will aggregate the meta from these battles.');
    console.log('You can now delete battle-store.json and meta-cache.json.');
}

main();
