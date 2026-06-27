import { Database } from 'bun:sqlite';
import { resolve } from 'path';
import { BattleRecord } from '../models/models';

const DB_PATH = resolve('meta.db');

/**
 * Converts an API battleTime ("20240617T120000.000Z") to epoch ms. Returns 0 on
 * an unparseable value so such records sort as ancient and get pruned out. Lives
 * here because the store is the only thing that needs a battle's time as a number
 * (for the indexed time column and the prune cutoff).
 */
export function parseBattleTime(battleTime: string): number {
    const m = battleTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
    if (!m) {
        return 0;
    }
    const [, year, month, day, hour, min, sec] = m;
    return Date.UTC(+year, +month - 1, +day, +hour, +min, +sec);
}

/** Raw battles row as stored; mapped back to a BattleRecord on read. */
interface BattleRow {
    key: string;
    battle_time: string;
    player_tag: string;
    card_ids: string;
    result: BattleRecord['result'];
    card_versions: string;
}

/**
 * SQLite-backed persistence for the rolling battle store and meta state.
 *
 * Replaces the former flat files (battle-store.json / meta-cache.json). Battles
 * live in one indexed table: dedup is the primary key (`INSERT OR IGNORE`), and
 * pruning the rolling window is a single indexed `DELETE` — so a refresh no
 * longer loads the whole multi-megabyte history into memory or rewrites it
 * wholesale. The aggregated meta is deliberately NOT persisted: it's cheap to
 * rebuild from the stored battles on demand (a single pass), so battles are the
 * one source of truth and there's no second file that can drift out of sync.
 *
 * Card ids and versions are stored as JSON text rather than normalised into
 * child tables: every read reconstructs a whole 8-card deck and aggregation keys
 * on the full deck anyway, so a child table would buy nothing but joins. The
 * .db file is portable — a later Go rewrite reads the same schema with a Go
 * SQLite driver and only the access code changes.
 */
export default class BattleStore {
    private db: Database;

    constructor(dbPath: string = DB_PATH) {
        this.db = new Database(dbPath, { create: true });
        // WAL gives better read/write concurrency and durability for a
        // long-running server; NORMAL sync is the standard WAL pairing.
        this.db.exec('PRAGMA journal_mode = WAL;');
        this.db.exec('PRAGMA synchronous = NORMAL;');
        this.init();
    }

    private init(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS battles (
                key            TEXT PRIMARY KEY,
                battle_time    TEXT    NOT NULL,
                battle_time_ms INTEGER NOT NULL,
                player_tag     TEXT    NOT NULL,
                card_ids       TEXT    NOT NULL,
                result         TEXT    NOT NULL,
                card_versions  TEXT    NOT NULL
            );
        `);
        // The prune (DELETE WHERE battle_time_ms < cutoff) and any windowed read
        // ride this index instead of scanning the whole table.
        this.db.exec('CREATE INDEX IF NOT EXISTS idx_battles_time ON battles(battle_time_ms);');
        // Single-row table holding the patch boundary and last-build time that
        // used to live in the two JSON files' headers.
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS meta_state (
                id             INTEGER PRIMARY KEY CHECK (id = 1),
                epoch_start_ms INTEGER NOT NULL DEFAULT 0,
                last_build_ms  INTEGER NOT NULL DEFAULT 0
            );
        `);
        this.db.exec('INSERT OR IGNORE INTO meta_state (id, epoch_start_ms, last_build_ms) VALUES (1, 0, 0);');
    }

    /**
     * Merges battle records into the store in one transaction, deduping on the
     * primary key (a given player's battle at a given time is one observation).
     * Returns how many rows were newly inserted — duplicates are ignored and
     * don't count, so this is the "+N new this fetch" figure.
     */
    mergeBattles(records: BattleRecord[]): number {
        const insert = this.db.prepare(
            `INSERT OR IGNORE INTO battles
                 (key, battle_time, battle_time_ms, player_tag, card_ids, result, card_versions)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        const insertMany = this.db.transaction((rows: BattleRecord[]) => {
            let added = 0;
            for (const r of rows) {
                const info = insert.run(
                    r.key,
                    r.battleTime,
                    parseBattleTime(r.battleTime),
                    r.playerTag,
                    JSON.stringify(r.cardIds),
                    r.result,
                    JSON.stringify(r.cardVersions)
                );
                // changes is 1 for a fresh insert, 0 when the key already existed.
                added += info.changes;
            }
            return added;
        });
        return insertMany(records);
    }

    /** Deletes battles older than the cutoff (epoch ms). Returns rows removed. */
    prune(cutoffMs: number): number {
        return this.db.prepare('DELETE FROM battles WHERE battle_time_ms < ?').run(cutoffMs).changes;
    }

    /** Removes every battle and resets the patch boundary — for a clean rebuild. */
    clear(): void {
        this.db.exec('DELETE FROM battles;');
        this.setEpochStart(0);
    }

    /** All stored battles, mapped back to BattleRecord for aggregation. */
    allBattles(): BattleRecord[] {
        const rows = this.db
            .prepare('SELECT key, battle_time, player_tag, card_ids, result, card_versions FROM battles')
            .all() as BattleRow[];
        return rows.map(row => ({
            key: row.key,
            battleTime: row.battle_time,
            playerTag: row.player_tag,
            cardIds: JSON.parse(row.card_ids) as number[],
            result: row.result,
            cardVersions: JSON.parse(row.card_versions),
        }));
    }

    count(): number {
        return (this.db.prepare('SELECT COUNT(*) AS n FROM battles').get() as { n: number }).n;
    }

    getEpochStart(): number {
        return (this.db.prepare('SELECT epoch_start_ms AS v FROM meta_state WHERE id = 1').get() as { v: number }).v;
    }

    setEpochStart(ms: number): void {
        this.db.prepare('UPDATE meta_state SET epoch_start_ms = ? WHERE id = 1').run(ms);
    }

    getLastBuild(): number {
        return (this.db.prepare('SELECT last_build_ms AS v FROM meta_state WHERE id = 1').get() as { v: number }).v;
    }

    setLastBuild(ms: number): void {
        this.db.prepare('UPDATE meta_state SET last_build_ms = ? WHERE id = 1').run(ms);
    }
}
