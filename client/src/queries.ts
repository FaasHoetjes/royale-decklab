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
  playerWarDecks: (tag: string, options = '') => ['player', tag, 'war-decks', options] as const,
  playerCollection: (tag: string) => ['player', tag, 'collection'] as const,
  playerUpgrades: (tag: string) => ['player', tag, 'upgrades'] as const,
  scoreDecks: (cards: ScoreDeckCard[], decks: (number | null)[][]) =>
    ['score-decks', cards, decks] as const,
};

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

/** `options` is the generator's query string (see lib/generatorOptions); '' = no options. */
export function playerWarDecksOptions(tag: string, options = '') {
  return {
    queryKey: queryKeys.playerWarDecks(tag, options),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerWarDecks(tag, options, signal),
  };
}

export function usePlayerWarDecks(tag: string | null, enabled = true, options = '') {
  return useQuery({
    ...playerWarDecksOptions(tag ?? '', options),
    enabled: !!tag && enabled,
    // Keep showing the current decks while new options load, but never another player's decks.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === tag ? previous : undefined),
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
