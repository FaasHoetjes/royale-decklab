import { useEffect } from 'react';
import {
  useQuery,
  useQueryClient,
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

// Shared so the hook and the imperative "copy set to builder" prefetch use the exact same key + fetcher.
export function playerCollectionOptions(tag: string) {
  return {
    queryKey: queryKeys.playerCollection(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerCollection(tag, signal),
  };
}

export function useMetaStatus() {
  return useQuery({
    queryKey: queryKeys.metaStatus,
    queryFn: ({ signal }) => fetchMetaStatus(signal),
    staleTime: Infinity,
  });
}

// Shared with the Landing page's pre-navigation tag check, so a successful check warms this cache for the instant paint on arrival.
export function playerWarDecksOptions(tag: string) {
  return {
    queryKey: queryKeys.playerWarDecks(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerWarDecks(tag, signal),
  };
}

export function usePlayerWarDecks(tag: string | null, enabled = true) {
  return useQuery({
    ...playerWarDecksOptions(tag ?? ''),
    enabled: !!tag && enabled,
  });
}

function allCardsOptions() {
  return {
    queryKey: queryKeys.cards,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchAllCards(signal),
    staleTime: Infinity,
  };
}

export function useAllCards() {
  return useQuery({
    ...allCardsOptions(),
    select: (res) => res.cards,
  });
}

export function usePlayerCollection(tag: string | null) {
  return useQuery({
    ...playerCollectionOptions(tag ?? ''),
    enabled: !!tag,
    select: (res) => res.cards,
  });
}

export function upgradeAdviceOptions(tag: string) {
  return {
    queryKey: queryKeys.playerUpgrades(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchUpgradeAdvice(tag, signal),
    staleTime: 5 * 60_000,
  };
}

export function useUpgradeAdvice(tag: string | null) {
  return useQuery({
    ...upgradeAdviceOptions(tag ?? ''),
    enabled: !!tag,
  });
}

// Best-effort: a failed prefetch is swallowed and the page's own query retries on visit.
export function usePrefetchAppData(tag: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tag) return;
    qc.prefetchQuery(upgradeAdviceOptions(tag));
    qc.prefetchQuery(playerCollectionOptions(tag));
    qc.prefetchQuery(allCardsOptions());
    qc.prefetchQuery(bestDecksOptions());
  }, [qc, tag]);
}

function bestDecksOptions() {
  return {
    queryKey: queryKeys.bestDecks,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchBestDecks(signal),
    staleTime: 5 * 60_000,
  };
}

export function useBestDecks() {
  return useQuery(bestDecksOptions());
}

// Pure function of (cards, decks): identical arrangements hit cache instead of re-POSTing.
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

export function fetchCollectionOnce(qc: QueryClient, tag: string) {
  return qc.fetchQuery(playerCollectionOptions(tag));
}
