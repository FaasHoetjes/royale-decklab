import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { useAllCards, useMetaStatus, usePlayerCollection, usePlayerWarDecks } from '../queries';
import { toBuilderCards } from '../lib/builderCards';
import { DEFAULT_OPTIONS, deckKey, hasActiveOptions, parseOptions, saveDefaults, toQuery, type GeneratorOptions } from '../lib/generatorOptions';
import { decodeShare } from '../lib/shareLink';
import { useApp } from '../AppContext';
import LoadError from '../components/LoadError';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import { useIsMobile } from '../hooks/useIsMobile';

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { activePlayerTag, setActivePlayerTag } = useApp();
  const isMobile = useIsMobile();

  const tag = playerId ? `#${playerId}` : null;

  // Options live in the URL (shareable). Each change loads at once: deck count and level are single
  // clicks, and the card picker applies its picks in one go when it closes.
  const [searchParams] = useSearchParams();
  // A share link pins its decks with locks and ignores the reader's own remembered options.
  const shared = useMemo(() => decodeShare(searchParams.get('share')), [searchParams]);
  const options = useMemo(
    () => (shared ? { ...DEFAULT_OPTIONS, decks: shared.length, lock: shared } : parseOptions(searchParams)),
    [shared, searchParams]
  );
  const query = toQuery(options);

  // Locking or unlocking a deck doesn't change the lineup on screen, so it doesn't fetch: the locks
  // go along with the next request that does (a different level, include or exclude). Clearing every
  // option does fetch, so Reset always gets the plain lineup even if the one shown was built around a lock.
  const [fetched, setFetched] = useState({ options, query });
  let apiQuery = fetched.query;
  if (fetched.options !== options) {
    if (!onlyLocksChanged(fetched.options, options) || !hasActiveOptions(options)) apiQuery = query;
    setFetched({ options, query: apiQuery });
  }

  // Write remembered defaults and cleaned-up values back, so the address bar always matches what is shown.
  const showOptions = (next: string) => navigate({ search: next ? `?${next}` : '' }, { replace: true });
  useEffect(() => {
    if (playerId && !shared && searchParams.toString().replace(/%2C/g, ',') !== query) showOptions(query);
  }, [playerId, query, shared]);

  const handleOptionsChange = (next: GeneratorOptions) => {
    saveDefaults(next);
    showOptions(toQuery(next));
  };

  const meta = useMetaStatus();
  const metaReady = meta.isSuccess;

  const warDecks = usePlayerWarDecks(tag, metaReady, apiQuery);
  // If changing options fails (e.g. the rate limit), keep showing this player's last decks instead of leaving the page.
  const lastLoaded = useRef<{ tag: string; data: NonNullable<typeof warDecks.data> } | null>(null);
  if (tag && warDecks.data && !warDecks.isPlaceholderData) lastLoaded.current = { tag, data: warDecks.data };
  const fallback = lastLoaded.current?.tag === tag ? lastLoaded.current.data : null;
  const playerData = warDecks.data ?? fallback;
  const optionsFailed = warDecks.isError && fallback != null;

  const catalog = useAllCards();
  const collection = usePlayerCollection(playerData && !shared ? tag : null);
  const pickerCards = useMemo(
    () => (catalog.data && collection.data ? toBuilderCards(catalog.data, collection.data) : []),
    [catalog.data, collection.data]
  );

  useEffect(() => {
    if (!playerId && activePlayerTag) {
      navigate(`/${activePlayerTag.replace(/#/g, '')}`, { replace: true });
    }
  }, [playerId, activePlayerTag]);

  // Once a tag's decks load successfully, make that player active app-wide (used by the Builder + Best
  // Decks); someone else's shared lineup leaves the reader's own player alone.
  useEffect(() => {
    if (warDecks.isSuccess && tag && !shared) setActivePlayerTag(tag);
  }, [warDecks.isSuccess, tag, shared]);

  useEffect(() => {
    if (warDecks.isError && playerId && !fallback) {
      if (!shared) setActivePlayerTag(null);
      navigate('/', {
        replace: true,
        state: {
          tagError: shared
            ? "Couldn't load that shared lineup. Try the link again in a moment."
            : "Couldn't load that player. Check your tag or try again.",
          badTag: playerId,
        },
      });
    }
  }, [warDecks.isError, playerId]);

  // Shown in the order they were shared; a deck the player can no longer field was replaced, and goes last.
  const shownDecks = useMemo(() => {
    const decks = playerData?.warDecks.decks ?? [];
    if (!shared) return decks;
    const order = shared.map(deckKey);
    const rank = (ids: number[]) => {
      const i = order.indexOf(deckKey(ids));
      return i < 0 ? order.length : i;
    };
    return [...decks].sort((a, b) => rank(a.cardIds) - rank(b.cardIds));
  }, [playerData, shared]);

  const getMyDecks = () => navigate(activePlayerTag ? `/${activePlayerTag.replace(/#/g, '')}` : '/');

  const handleSearch = (playerTag: string) => {
    navigate(`/${playerTag.replace(/#/g, '')}`);
  };

  const handleNewSearch = () => {
    setActivePlayerTag(null);
    navigate('/');
  };

  if (!metaReady) {
    if (!meta.isError) return <WarDecksSkeleton isMobile={isMobile} />;

    return (
      <LoadError
        title="Can't reach the server"
        message="Royale DeckLab is unreachable right now. Please try again in a moment."
        onRetry={() => meta.refetch()}
        retrying={meta.isFetching}
        retryLabel="Retry connection"
        style={{ minHeight: '80dvh' }}
      />
    );
  }

  return playerData ? (
    <WarDeckResult
      playerName={playerData.player.name}
      playerTag={tag!}
      decks={shownDecks}
      alternatives={playerData.warDecks.alternatives}
      onNewSearch={handleNewSearch}
      options={options}
      onOptionsChange={handleOptionsChange}
      cards={pickerCards}
      isUpdating={!optionsFailed && warDecks.isPlaceholderData}
      updateFailed={optionsFailed}
      onRetry={() => warDecks.refetch()}
      shared={shared ? { onGetMine: getMyDecks } : undefined}
    />
  ) : tag || activePlayerTag ? (
    <WarDecksSkeleton isMobile={isMobile} />
  ) : (
    <PlayerSearch onSearch={handleSearch} isLoading={warDecks.isFetching} />
  );
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function onlyLocksChanged(a: GeneratorOptions, b: GeneratorOptions): boolean {
  return a.decks === b.decks && a.minLevel === b.minLevel && sameIds(a.ban, b.ban) && sameIds(a.require, b.require);
}
