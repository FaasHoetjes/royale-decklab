import { useEffect, useSyncExternalStore } from 'react';
import {
  useQuery,
  useQueryClient,
  keepPreviousData,
  type QueryClient,
} from '@tanstack/react-query';
import {
  fetchMetaStatus,
  fetchPlayerWarDecks,
  fetchPlayerSummary,
  type PlayerResponse,
  fetchAllCards,
  fetchPlayerCollection,
  fetchBestDecks,
  fetchCardStats,
  fetchCardDecks,
  fetchUpgradeAdvice,
  fetchClanWar,
  fetchClanReminders,
  searchClans,
  fetchWarDecksToday,
  scoreBuilderDecks,
  isMetaLoading,
  type ScoreDeckCard,
} from './api';

const FIVE_MINUTES_MS = 5 * 60_000;
const WAR_START_RECHECK_MS = 60_000;

export const queryKeys = {
  metaStatus: ['meta', 'status'] as const,
  cards: ['cards'] as const,
  bestDecks: ['best-decks'] as const,
  cardStats: ['card-stats'] as const,
  cardDecks: (cardId: number) => ['card-decks', cardId] as const,
  playerWarDecks: (tag: string, options = '') => ['player', tag, 'war-decks', options] as const,
  playerSummary: (tag: string) => ['player', tag, 'summary'] as const,
  playerCollection: (tag: string) => ['player', tag, 'collection'] as const,
  playerUpgrades: (tag: string) => ['player', tag, 'upgrades'] as const,
  playerWarToday: (tag: string) => ['player', tag, 'war-today'] as const,
  clanWar: (clanTag: string) => ['clan', clanTag, 'war'] as const,
  clanReminders: (clanTag: string) => ['clan', clanTag, 'discord-reminders'] as const,
  clanSearch: (name: string) => ['clan-search', name] as const,
  scoreDecks: (cards: ScoreDeckCard[], decks: (number | null)[][]) =>
    ['score-decks', cards, decks] as const,
};

export function playerCollectionOptions(tag: string) {
  return {
    queryKey: queryKeys.playerCollection(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchPlayerCollection(tag, signal),
  };
}

/** True while something on the page waits for the server to finish reloading the meta. */
export function useMetaLoading(): boolean {
  const cache = useQueryClient().getQueryCache();
  return useSyncExternalStore(
    (onChange) => cache.subscribe(onChange),
    () => cache.findAll({ type: 'active' }).some((q) => q.state.status === 'pending' && isMetaLoading(q.state.fetchFailureReason)),
  );
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

export function usePlayerSummary(tag: string | null) {
  const qc = useQueryClient();
  const decksKey = queryKeys.playerWarDecks(tag ?? '');
  return useQuery({
    queryKey: queryKeys.playerSummary(tag ?? ''),
    queryFn: ({ signal }) => fetchPlayerSummary(tag ?? '', signal),
    enabled: !!tag,
    initialData: () => qc.getQueryData<PlayerResponse>(decksKey)?.player,
    initialDataUpdatedAt: () => qc.getQueryState(decksKey)?.dataUpdatedAt,
  });
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

function upgradeAdviceOptions(tag: string) {
  return {
    queryKey: queryKeys.playerUpgrades(tag),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchUpgradeAdvice(tag, signal),
    staleTime: FIVE_MINUTES_MS,
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
    qc.prefetchQuery(playerCollectionOptions(tag));
    qc.prefetchQuery(allCardsOptions());
    qc.prefetchQuery(bestDecksOptions());
  }, [qc, tag]);
}

function bestDecksOptions() {
  return {
    queryKey: queryKeys.bestDecks,
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchBestDecks(signal),
    staleTime: FIVE_MINUTES_MS,
  };
}

export function useBestDecks() {
  return useQuery(bestDecksOptions());
}

export function useCardStats() {
  return useQuery({
    queryKey: queryKeys.cardStats,
    queryFn: ({ signal }) => fetchCardStats(signal),
    staleTime: FIVE_MINUTES_MS,
  });
}

export function useCardDecks(cardId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.cardDecks(cardId ?? 0),
    queryFn: ({ signal }) => fetchCardDecks(cardId!, signal),
    enabled: cardId != null,
    staleTime: FIVE_MINUTES_MS,
  });
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

/** Fetch on opening/returning or manual refresh; the server shares a clan snapshot for 60 seconds. */
export const useClanWar = (clanTag: string | null) => {
  const war = useQuery({
    queryKey: queryKeys.clanWar(clanTag ?? ''),
    queryFn: ({ signal }) => fetchClanWar(clanTag ?? '', signal),
    enabled: !!clanTag,
    staleTime: 60_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
  });
  const { refetch, dataUpdatedAt, errorUpdatedAt } = war;
  const warStartsAt = war.data && !war.data.isBattleDay ? war.data.warStartsAt : null;

  // The start time is an estimate, so once it passes this checks again every minute until the war is on.
  // A hidden tab stops checking; returning to it refetches and restarts the timer.
  useEffect(() => {
    if (!warStartsAt) return;
    const untilStart = Date.parse(warStartsAt) - Date.now();
    const timer = window.setTimeout(() => {
      if (!document.hidden) void refetch();
    }, untilStart > 0 ? untilStart : WAR_START_RECHECK_MS);
    return () => window.clearTimeout(timer);
  }, [warStartsAt, dataUpdatedAt, errorUpdatedAt, refetch]);

  return war;
};

export const useClanReminders = (clanTag: string) =>
  useQuery({
    queryKey: queryKeys.clanReminders(clanTag),
    queryFn: ({ signal }) => fetchClanReminders(clanTag, signal),
    staleTime: FIVE_MINUTES_MS,
    retry: 1,
  });

/** Keeps the last results up while the next name loads, so the list doesn't blink as someone types. */
export const useClanSearch = (name: string | null) =>
  useQuery({
    queryKey: queryKeys.clanSearch(name ?? ''),
    queryFn: ({ signal }) => searchClans(name ?? '', signal),
    enabled: !!name,
    staleTime: FIVE_MINUTES_MS,
    placeholderData: keepPreviousData,
    retry: 1,
  });

export const useWarDecksToday = (playerTag: string | null) =>
  useQuery({
    queryKey: queryKeys.playerWarToday(playerTag ?? ''),
    queryFn: ({ signal }) => fetchWarDecksToday(playerTag ?? '', signal),
    enabled: !!playerTag,
  });
