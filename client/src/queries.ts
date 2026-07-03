// React Query hooks wrapping the raw fetch helpers in api.ts. Components read
// server data through these instead of hand-rolling fetch/loading/error/abort
// and per-page caches — the query client handles caching, dedup, retries, and
// keeping previous data on-screen while re-fetching.
import {
  useQuery,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  fetchMetaStatus,
  fetchPlayerWarDecks,
  fetchAllCards,
  fetchPlayerCollection,
  fetchBestDecks,
  fetchUpgradeAdvice,
  scoreBuilderDecks,
  type ScoreDeckCard,
} from './api';

// Central key registry so a mutation/prefetch and the hook that reads it can't
// drift apart. Player-scoped keys nest under the tag, so all of a player's
// cached data (war decks, collection) shares a prefix.
export const queryKeys = {
  metaStatus: ['meta', 'status'] as const,
  cards: ['cards'] as const,
  bestDecks: ['best-decks'] as const,
  playerWarDecks: (tag: string) => ['player', tag, 'war-decks'] as const,
  playerCollection: (tag: string) => ['player', tag, 'collection'] as const,
  playerUpgrades: (tag: string) => ['player', tag, 'upgrades'] as const,
  scoreDecks: (cards: ScoreDeckCard[], decks: (number | null)[][]) =>
    ['score-decks', cards, decks] as const,
};

// The player's collection is read by the builder (as a hook) and prefetched
// imperatively by the "copy set to builder" flow, so its options live here to
// keep both call sites on the exact same key + fetcher.
export function playerCollectionOptions(tag: string) {
  return {
    queryKey: queryKeys.playerCollection(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerCollection(tag, signal),
  };
}

// Meta/backend readiness. Doesn't change under us during a session, so once it
// resolves it stays fresh — a page remount won't flash the "connecting" screen.
export function useMetaStatus() {
  return useQuery({
    queryKey: queryKeys.metaStatus,
    queryFn: ({ signal }) => fetchMetaStatus(signal),
    staleTime: Infinity,
  });
}

// A player's recommended war decks. Disabled until there's a tag and the
// backend is confirmed up, so we don't fire a request that's bound to fail.
export function usePlayerWarDecks(tag: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.playerWarDecks(tag ?? ''),
    queryFn: ({ signal }) => fetchPlayerWarDecks(tag!, signal),
    enabled: !!tag && enabled,
  });
}

// The full card catalog — effectively static, so never goes stale in-session.
// `select` unwraps to the card array so callers don't repeat `.cards`.
export function useAllCards() {
  return useQuery({
    queryKey: queryKeys.cards,
    queryFn: ({ signal }) => fetchAllCards(signal),
    staleTime: Infinity,
    select: (res) => res.cards,
  });
}

// The active player's owned cards (levels + evo/hero tier). `select` unwraps to
// the card array; disabled when no player is active.
export function usePlayerCollection(tag: string | null) {
  return useQuery({
    ...playerCollectionOptions(tag ?? ''),
    enabled: !!tag,
    select: (res) => res.cards,
  });
}

// The active player's ranked upgrade suggestions. Only moves when the player's
// collection or the meta changes, so a revisit within the session reuses cache.
export function useUpgradeAdvice(tag: string | null) {
  return useQuery({
    queryKey: queryKeys.playerUpgrades(tag ?? ''),
    queryFn: ({ signal }) => fetchUpgradeAdvice(tag!, signal),
    enabled: !!tag,
    staleTime: 5 * 60_000,
  });
}

// The top ranked 4-deck war sets. Stable enough to reuse across visits.
export function useBestDecks() {
  return useQuery({
    queryKey: queryKeys.bestDecks,
    queryFn: ({ signal }) => fetchBestDecks(signal),
    staleTime: 5 * 60_000,
  });
}

// Score the builder's current decks on the backend. The result is a pure
// function of (cards, decks), so it never goes stale and identical arrangements
// hit the cache instead of re-POSTing. `keepPreviousData` keeps the last scores
// on-screen while a fresh arrangement is scored, avoiding a flicker to blank.
// Callers debounce the inputs and pass `enabled: false` for an empty board.
export function useDeckScores(
  cards: ScoreDeckCard[],
  decks: (number | null)[][],
  enabled: boolean
) {
  return useQuery({
    queryKey: queryKeys.scoreDecks(cards, decks),
    queryFn: ({ signal }) => scoreBuilderDecks(cards, decks, signal),
    enabled,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });
}

// Imperatively load (and cache) a player's collection outside of render — used
// by the "copy set to builder" hand-off, which needs the owned-card list once,
// not reactively.
export function fetchCollectionOnce(qc: QueryClient, tag: string) {
  return qc.fetchQuery(playerCollectionOptions(tag));
}
