import Meta from '../api/meta';
import { BattleRecord, CardVersion, DeckMeta, popularityWeight } from '../models/models';

// How many top players to pull battle logs from. More players → larger samples
// per deck → tighter Wilson bounds. This runs as a background job (every couple
// of hours), so the extra API time is not on any user's critical path. The
// official Path of Legend leaderboard returns up to 1000 entries in one call.
const MAX_TOP_PLAYERS = 1000;

/**
 * Wilson score lower bound for a binomial proportion.
 *
 * Returns a conservative estimate of the true win rate: the lower end of the
 * confidence interval around the observed rate. Small samples have wide
 * intervals, so their bound is pulled far below the observed rate; large
 * samples have tight intervals, so their bound stays close to it. This makes
 * "60% over 300 games" rank above "100% over 3 games" without any hard cutoff.
 *
 * z controls the confidence level (1.96 ≈ 95%). Higher z = more skeptical of
 * small samples.
 */
function wilsonLowerBound(wins: number, total: number, z: number = 1.96): number {
    if (total <= 0) {
        return 0;
    }
    const p = wins / total;
    const z2 = z * z;
    const denominator = 1 + z2 / total;
    const center = p + z2 / (2 * total);
    const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return Math.max(0, (center - margin) / denominator);
}

export default class MetaBuilder {
    private meta: Meta;

    constructor() {
        this.meta = new Meta();
    }

    /**
     * Collects battle records from a large pool of top players. The official
     * Path of Legend leaderboard gives us up to MAX_TOP_PLAYERS seeds directly,
     * which is normally enough sample on its own. We still snowball — harvest the
     * opponents those seeds faced in ranked/PoL (themselves high-ladder players)
     * and process any that fit under the cap — so the sample stays robust if the
     * leaderboard ever returns fewer than the full 1000.
     *
     * Returns [] (rather than throwing) if no seeds are found, so a transient
     * fetch failure leaves the existing store untouched instead of wiping it.
     */
    async collectBattleRecords(): Promise<BattleRecord[]> {
        console.log('Collecting battle records...');
        const startTime = Date.now();

        const seeds = await this.fetchTopPlayers();
        console.log(`Fetched ${seeds.length} seed players from the Path of Legend leaderboard`);

        if (seeds.length === 0) {
            console.warn('No seed players found.');
            return [];
        }

        const records: BattleRecord[] = [];
        const seedSet = new Set(seeds);
        const opponentTags = new Set<string>();

        // Round 1: the scraped seeds, collecting the opponents they faced.
        console.log(`Round 1: processing ${seeds.length} seed players`);
        records.push(...await this.processPlayers(seeds, opponentTags, seedSet));

        // Round 2: those opponents, capped so the total stays under the limit.
        const remaining = Math.max(0, MAX_TOP_PLAYERS - seeds.length);
        const extras = [...opponentTags].slice(0, remaining);
        console.log(`Round 2: processing ${extras.length} opponents (${opponentTags.size} seen, cap ${MAX_TOP_PLAYERS})`);
        records.push(...await this.processPlayers(extras));

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Collected ${records.length} battle records from ${seeds.length + extras.length} players in ${elapsed}s`);
        return records;
    }

    /**
     * Fetches and parses the battle logs for a list of players in concurrent
     * batches. If `collectOpponentsInto` is given, opponent tags from each
     * ranked/PoL battle are added to it (minus anything in `exclude`), which is
     * how the snowball discovers more players to process.
     */
    private async processPlayers(
        tags: string[],
        collectOpponentsInto?: Set<string>,
        exclude?: Set<string>
    ): Promise<BattleRecord[]> {
        const records: BattleRecord[] = [];
        const batchSize = 10;
        for (let i = 0; i < tags.length; i += batchSize) {
            const batch = tags.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(tag => this.processBattleLog(tag)));
            for (const { records: playerRecords, opponentTags } of results) {
                records.push(...playerRecords);
                if (collectOpponentsInto) {
                    for (const opponentTag of opponentTags) {
                        if (!exclude || !exclude.has(opponentTag)) {
                            collectOpponentsInto.add(opponentTag);
                        }
                    }
                }
            }
            console.log(`Processed ${Math.min(i + batchSize, tags.length)}/${tags.length} players`);
        }
        return records;
    }

    /**
     * Fetches the top players' tags from the official Path of Legend leaderboard.
     * Returns [] on failure so a transient outage leaves the existing store
     * untouched rather than wiping it.
     */
    private async fetchTopPlayers(): Promise<string[]> {
        try {
            const players = await this.meta.getTopPlayers(MAX_TOP_PLAYERS);
            const tags = players.map(p => p.tag).filter((tag): tag is string => !!tag);
            return tags.slice(0, MAX_TOP_PLAYERS);
        } catch (error) {
            console.error('Error fetching Path of Legend leaderboard:', error);
            return [];
        }
    }

    private async processBattleLog(playerTag: string): Promise<{ records: BattleRecord[]; opponentTags: string[] }> {
        const records: BattleRecord[] = [];
        const opponentTags: string[] = [];
        try {
            const battles = await this.meta.getPlayerBattlelog(playerTag);

            for (const battle of battles) {
                if (battle.type !== 'pathOfLegend' && battle.type !== 'rankedMatch') {
                    continue;
                }

                const playerTeam = battle.team[0];
                const playerOpponent = battle.opponent[0];
                // Sort card ids so the same 8-card deck always produces the same
                // key regardless of the order the API lists them in. Otherwise an
                // identical deck fragments into several keys, shrinking each
                // sample and inflating extreme win rates.
                const cardIds = playerTeam.cards.map(c => c.id).sort((a, b) => a - b);

                const isDraw = playerTeam.crowns === playerOpponent.crowns;
                const playerWon = playerTeam.crowns > playerOpponent.crowns;
                const result: BattleRecord['result'] = isDraw ? 'draw' : playerWon ? 'win' : 'loss';

                // Which special version each card was fielded as. The battlelog
                // encodes this in evolutionLevel: 1 = evolution, 2+ = the "hero"
                // tier (e.g. Hero Knight; some cards like Barbarian Barrel only
                // ever appear as hero). iconUrls only says a card *can* evolve,
                // not that it did, so evolutionLevel is the signal to use.
                const cardVersions: CardVersion[] = playerTeam.cards.map(card => {
                    const evolutionLevel = card.evolutionLevel ?? 0;
                    const version: CardVersion['version'] =
                        evolutionLevel >= 2 ? 'hero' : evolutionLevel === 1 ? 'evo' : 'normal';
                    return { cardId: card.id, version };
                });

                records.push({
                    // A player has one battle per battleTime; that pair is the
                    // natural dedup key across overlapping refresh windows.
                    key: `${playerTag}|${battle.battleTime}`,
                    battleTime: battle.battleTime,
                    playerTag,
                    cardIds,
                    result,
                    cardVersions
                });

                // The opponent in a ranked/PoL battle is another high-ladder
                // player — a good candidate to expand the sample with.
                if (playerOpponent.tag) {
                    opponentTags.push(playerOpponent.tag);
                }
            }
        } catch (error) {
            console.error(`Error processing battle log for ${playerTag}:`, error);
        }
        return { records, opponentTags };
    }

    /**
     * Aggregates the rolling battle store into ranked deck stats. Because the
     * store accumulates battles across refreshes, the per-deck sample here is
     * far larger than any single fetch — which is the whole point: tighter
     * Wilson bounds and a meaningful pick rate.
     */
    aggregateBattles(records: BattleRecord[]): DeckMeta[] {
        interface DeckAgg {
            wins: number;
            losses: number;
            draws: number;
            players: Set<string>;
            latestTime: string;
            cardVersions: CardVersion[];
        }

        // Pick rate is relative to how many distinct players we sampled at all.
        const sampledPlayers = new Set(records.map(r => r.playerTag)).size;

        const byDeck = new Map<string, DeckAgg>();
        for (const record of records) {
            const deckKey = JSON.stringify(record.cardIds);
            let agg = byDeck.get(deckKey);
            if (!agg) {
                agg = { wins: 0, losses: 0, draws: 0, players: new Set(), latestTime: '', cardVersions: record.cardVersions };
                byDeck.set(deckKey, agg);
            }

            if (record.result === 'win') {
                agg.wins++;
            } else if (record.result === 'loss') {
                agg.losses++;
            } else {
                agg.draws++;
            }
            agg.players.add(record.playerTag);

            // Track card versions from the most recent battle, so evo/hero usage
            // reflects how the deck is currently being played. battleTime strings
            // share a fixed format, so lexical comparison is chronological.
            if (record.battleTime > agg.latestTime) {
                agg.latestTime = record.battleTime;
                agg.cardVersions = record.cardVersions;
            }
        }

        const decks: DeckMeta[] = [];
        for (const [deckKey, agg] of byDeck) {
            const total = agg.wins + agg.losses + agg.draws;
            // No hard sample cutoff: the Wilson bound below already discounts
            // small samples. Skip only single-game noise.
            if (total < 2) {
                continue;
            }

            const cardIds = JSON.parse(deckKey) as number[];
            // Count a draw as half a win for rate purposes.
            const effectiveWins = agg.wins + agg.draws * 0.5;
            const winRate = effectiveWins / total;
            const confidence = wilsonLowerBound(effectiveWins, total);

            decks.push({
                cardIds,
                winRate,
                confidence,
                uses: total,
                players: agg.players.size,
                pickRate: sampledPlayers > 0 ? agg.players.size / sampledPlayers : 0,
                cardVersions: agg.cardVersions
            });
        }

        // Rank by confidence-adjusted win rate weighted by player count, so a
        // strong record over many games and many players beats a perfect record
        // from one player over a few games.
        const metaScore = (d: DeckMeta) => d.confidence * popularityWeight(d.players ?? 1);
        decks.sort((a, b) => metaScore(b) - metaScore(a));
        return decks;
    }
}
