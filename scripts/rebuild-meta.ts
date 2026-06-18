// One-shot clean rebuild of the meta store + cache.
//
// Why this exists: the production rebuild MERGES freshly-fetched battles into
// the existing battle-store.json (deduped by key). That store was written by the
// old iconUrls-based evolution detector, which over-flagged evolution-capable
// cards as evos. Merging can't repair those legacy records, so we rebuild from a
// clean slate: fetch fresh battles (current evolutionLevel-based detection),
// aggregate, and write both files directly. Mirrors server.ts persistAndAggregate
// (7-day window, epochStart 0) but skips the merge.
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
    const fresh = await builder.collectBattleRecords();
    if (fresh.length === 0) {
        console.error('Fetched 0 battles — aborting so existing files are left intact.');
        process.exit(1);
    }

    const cutoff = Date.now() - BATTLE_WINDOW_MS;
    const kept = fresh.filter(r => parseBattleTime(r.battleTime) >= cutoff);

    writeFileSync(resolve('battle-store.json'), JSON.stringify({ battles: kept, epochStart: 0 }));

    const decks = builder.aggregateBattles(kept);
    writeFileSync(resolve('meta-cache.json'), JSON.stringify({ timestamp: Date.now(), decks }, null, 2));

    const illegal = decks.filter(d => (d.cardVersions ?? []).filter(v => v.version !== 'normal').length > 3).length;
    console.log(`\nRebuilt: ${decks.length} decks from ${kept.length}/${fresh.length} battles.`);
    console.log(`Decks with >3 specials after rebuild: ${illegal} (expect 0).`);
}

main();
