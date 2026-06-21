import Meta from '../api/meta';
import { BattleRecord, CardVersion, DeckMeta, popularityWeight } from '../models/models';

// --- Clan-war collection ---------------------------------------------------
// The meta is built from real Clan War battles. The clan-war leaderboard lists
// clans, we pull each clan's ~50 members, then sample their battle logs. We take
// the top 100 war clans (~5000 players): all still elite war play, and a large,
// varied sample that gives good coverage for the personalized card-disjoint deck
// search. We don't go deeper because war-skill collapses past the top ~200 clans
// (clanScore 12677 → 5000 by rank 200, then a thin 5000 → 4380 tail to rank
// 1000), so further clans only dilute the meta while multiplying API cost.
const MAX_WAR_CLANS = 100;
// Safety ceiling only: stop walking clans if we somehow blow past this many
// records before reaching MAX_WAR_CLANS (guards against a future where battle
// logs balloon). At ~12k records per 10 clans, 100 clans lands near ~120k, so in
// normal operation this never trips and all MAX_WAR_CLANS clans are processed.
const WAR_RECORD_TARGET = 250000;
// Only the standard war 1v1 counts among riverRacePvP battles. The same type
// also carries modifier modes (e.g. RampUpElixir_Ladder) whose altered rules
// skew which decks win, so we filter to the vanilla mode by gameMode name.
const WAR_BATTLE_MODE = 'CW_Battle_1v1';

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
     * Collects battle records from real Clan War battles. Walks the top war clans
     * strongest-first, pulls each clan's roster, and samples their war battle logs
     * until WAR_RECORD_TARGET records are gathered. Feeds the aggregateBattles →
     * Wilson → disjoint-fill machinery.
     *
     * Returns [] (rather than throwing) on a failed leaderboard fetch, so a
     * transient outage leaves any existing store untouched.
     */
    async collectWarBattleRecords(): Promise<BattleRecord[]> {
        console.log('Collecting WAR battle records...');
        const startTime = Date.now();

        const clanTags = await this.fetchTopWarClans();
        console.log(`Fetched ${clanTags.length} top war clans`);
        if (clanTags.length === 0) {
            console.warn('No war clans found.');
            return [];
        }

        const records = await this.processWarClans(clanTags, WAR_RECORD_TARGET);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`Collected ${records.length} war battle records in ${elapsed}s`);
        return records;
    }

    /**
     * Fetches the top war clans' tags. Returns [] on failure so a transient
     * outage leaves the existing store untouched rather than wiping it.
     */
    private async fetchTopWarClans(): Promise<string[]> {
        try {
            const tags = await this.meta.getTopWarClans(MAX_WAR_CLANS);
            return tags.slice(0, MAX_WAR_CLANS);
        } catch (error) {
            console.error('Error fetching war clan rankings:', error);
            return [];
        }
    }

    /**
     * Walks the top MAX_WAR_CLANS clans strongest-first: for each batch it fetches
     * their rosters, then processes those members' war battle logs. `target` is
     * only a runaway safety ceiling (see WAR_RECORD_TARGET) — normally every clan
     * up to the cap is processed. A clan whose roster fetch fails is skipped.
     */
    private async processWarClans(clanTags: string[], target: number): Promise<BattleRecord[]> {
        const records: BattleRecord[] = [];
        const seenPlayers = new Set<string>();
        const clanBatchSize = 10;

        for (let i = 0; i < clanTags.length; i += clanBatchSize) {
            const clanBatch = clanTags.slice(i, i + clanBatchSize);
            const rosters = await Promise.all(
                clanBatch.map(tag => this.meta.getClanMemberTags(tag).catch(() => [] as string[]))
            );
            // A player is only in one clan, but dedup defensively anyway.
            const members = rosters.flat().filter(tag => !seenPlayers.has(tag));
            members.forEach(tag => seenPlayers.add(tag));

            records.push(...await this.processWarPlayers(members));
            console.log(
                `Processed ${Math.min(i + clanBatchSize, clanTags.length)}/${clanTags.length} clans ` +
                `(${seenPlayers.size} players, ${records.length} records)`
            );

            if (records.length >= target) {
                console.log(`Reached war record target (${target}); stopping early.`);
                break;
            }
        }
        return records;
    }

    /**
     * Fetches and parses the WAR battle logs for a list of players in concurrent
     * batches. Unlike the PoL path there is no snowball: the clan leaderboard
     * already defines a large, well-scoped pool of elite war players.
     */
    private async processWarPlayers(tags: string[]): Promise<BattleRecord[]> {
        const records: BattleRecord[] = [];
        const batchSize = 10;
        for (let i = 0; i < tags.length; i += batchSize) {
            const batch = tags.slice(i, i + batchSize);
            const results = await Promise.all(batch.map(tag => this.processWarBattleLog(tag)));
            for (const playerRecords of results) {
                records.push(...playerRecords);
            }
        }
        return records;
    }

    /**
     * Parses one player's battle log for war battles. Two war modes contribute:
     *   - riverRacePvP (the standard war "Battle") in the vanilla CW_Battle_1v1
     *     mode only — a single 8-card deck per side.
     *   - riverRaceDuel (best-of-3): each game is in `rounds[]` with its own
     *     8-card deck and crowns, so every round becomes its own record (keyed
     *     with an `|rN` suffix to keep the rounds distinct).
     * boatBattle is intentionally ignored — it's asymmetric attack/defense, not a
     * deck-vs-deck signal. Both sides of every game are recorded: the opponent's
     * deck and result are already in the same payload, and recording only one side
     * would bias the meta toward winners.
     */
    private async processWarBattleLog(playerTag: string): Promise<BattleRecord[]> {
        const records: BattleRecord[] = [];
        try {
            const battles = await this.meta.getPlayerBattlelog(playerTag);

            for (const battle of battles) {
                const team = battle.team?.[0];
                const opponent = battle.opponent?.[0];
                if (!team || !opponent) {
                    continue;
                }

                if (battle.type === 'riverRacePvP' && battle.gameMode?.name === WAR_BATTLE_MODE) {
                    this.recordWarPair(records, playerTag, opponent.tag, battle.battleTime, team, opponent);
                } else if (battle.type === 'riverRaceDuel') {
                    const teamRounds = team.rounds ?? [];
                    const oppRounds = opponent.rounds ?? [];
                    const rounds = Math.min(teamRounds.length, oppRounds.length);
                    for (let r = 0; r < rounds; r++) {
                        this.recordWarPair(
                            records, playerTag, opponent.tag, battle.battleTime,
                            teamRounds[r], oppRounds[r], `|r${r}`
                        );
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing war battle log for ${playerTag}:`, error);
        }
        return records;
    }

    /**
     * Records both sides of one war game from a single battlelog entry. crowns
     * decide the result; the opponent's outcome is the mirror. Keying each side
     * by its own tag (plus the shared battleTime and round suffix) means the
     * opponent's record merges with their own self-record if they're also
     * sampled — no double counting — while still being captured if they aren't.
     */
    private recordWarPair(
        records: BattleRecord[],
        playerTag: string,
        opponentTag: string | undefined,
        battleTime: string,
        teamSide: { cards?: { id: number; evolutionLevel?: number }[]; crowns: number },
        oppSide: { cards?: { id: number; evolutionLevel?: number }[]; crowns: number },
        keySuffix: string = ''
    ): void {
        const isDraw = teamSide.crowns === oppSide.crowns;
        const playerWon = teamSide.crowns > oppSide.crowns;
        const playerResult: BattleRecord['result'] = isDraw ? 'draw' : playerWon ? 'win' : 'loss';
        const opponentResult: BattleRecord['result'] = isDraw ? 'draw' : playerWon ? 'loss' : 'win';

        const playerRecord = this.toBattleRecord(playerTag, battleTime, teamSide, playerResult, keySuffix);
        if (playerRecord) {
            records.push(playerRecord);
        }
        if (opponentTag) {
            const opponentRecord = this.toBattleRecord(opponentTag, battleTime, oppSide, opponentResult, keySuffix);
            if (opponentRecord) {
                records.push(opponentRecord);
            }
        }
    }

    /**
     * Builds a BattleRecord for one side of a battle from that side's battlelog
     * entry. Returns null if the entry has no usable 8-card deck. The record is
     * keyed by `tag|battleTime`: a player has one battle per timestamp, so this
     * is the natural dedup key across overlapping refresh windows AND across the
     * two perspectives a single physical battle is seen from.
     */
    private toBattleRecord(
        tag: string,
        battleTime: string,
        side: { cards?: { id: number; evolutionLevel?: number }[] },
        result: BattleRecord['result'],
        keySuffix: string = ''
    ): BattleRecord | null {
        const cards = side.cards;
        if (!Array.isArray(cards) || cards.length === 0) {
            return null;
        }
        // Sort card ids so the same 8-card deck always produces the same key
        // regardless of the order the API lists them in. Otherwise an identical
        // deck fragments into several keys, shrinking each sample and inflating
        // extreme win rates.
        const cardIds = cards.map(c => c.id).sort((a, b) => a - b);
        // Which special version each card was fielded as. The battlelog encodes
        // this in evolutionLevel: 1 = evolution, 2+ = the "hero" tier (e.g. Hero
        // Knight; some cards like Barbarian Barrel only ever appear as hero).
        // iconUrls only says a card *can* evolve, not that it did, so
        // evolutionLevel is the signal to use.
        const cardVersions: CardVersion[] = cards.map(card => {
            const evolutionLevel = card.evolutionLevel ?? 0;
            const version: CardVersion['version'] =
                evolutionLevel >= 2 ? 'hero' : evolutionLevel === 1 ? 'evo' : 'normal';
            return { cardId: card.id, version };
        });

        // keySuffix distinguishes the rounds of a single duel, which all share
        // one battleTime for one player — without it they'd collide on the dedup
        // key and merge into a single observation.
        return { key: `${tag}|${battleTime}${keySuffix}`, battleTime, playerTag: tag, cardIds, result, cardVersions };
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
