import { useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { useAllCards, useMetaStatus, usePlayerCollection, usePlayerWarDecks } from '../queries';
import { toBuilderCards } from '../lib/builderCards';
import { parseOptions, saveDefaults, toQuery, type GeneratorOptions } from '../lib/generatorOptions';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import { useIsMobile } from '../hooks/useIsMobile';

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { activePlayerTag, setActivePlayerTag } = useApp();
  const isMobile = useIsMobile();

  const tag = playerId ? `#${playerId}` : null;

  // Options live in the URL (shareable); a short pause after each change avoids one request per click.
  const [searchParams] = useSearchParams();
  const options = useMemo(() => parseOptions(searchParams), [searchParams]);
  const query = toQuery(options);
  const debouncedQuery = useDebouncedValue(query, 350);

  // Write remembered defaults and cleaned-up values back, so the address bar always matches what is shown.
  const showOptions = (next: string) => navigate({ search: next ? `?${next}` : '' }, { replace: true });
  useEffect(() => {
    if (playerId && searchParams.toString().replace(/%2C/g, ',') !== query) showOptions(query);
  }, [playerId, query]);

  const handleOptionsChange = (next: GeneratorOptions) => {
    saveDefaults(next);
    showOptions(toQuery(next));
  };

  const meta = useMetaStatus();
  const metaReady = meta.isSuccess;

  const warDecks = usePlayerWarDecks(tag, metaReady, debouncedQuery);
  // If changing options fails (e.g. the rate limit), keep showing this player's last decks instead of leaving the page.
  const lastLoaded = useRef<{ tag: string; data: NonNullable<typeof warDecks.data> } | null>(null);
  if (tag && warDecks.data && !warDecks.isPlaceholderData) lastLoaded.current = { tag, data: warDecks.data };
  const fallback = lastLoaded.current?.tag === tag ? lastLoaded.current.data : null;
  const playerData = warDecks.data ?? fallback;
  const optionsFailed = warDecks.isError && fallback != null;

  const catalog = useAllCards();
  const collection = usePlayerCollection(playerData ? tag : null);
  const pickerCards = useMemo(
    () => (catalog.data && collection.data ? toBuilderCards(catalog.data, collection.data) : []),
    [catalog.data, collection.data]
  );

  useEffect(() => {
    if (!playerId && activePlayerTag) {
      navigate(`/${activePlayerTag.replace(/#/g, '')}`, { replace: true });
    }
  }, [playerId, activePlayerTag]);

  // Once a tag's decks load successfully, make that player active app-wide
  // (used by the Builder + Best Decks).
  useEffect(() => {
    if (warDecks.isSuccess && tag) setActivePlayerTag(tag);
  }, [warDecks.isSuccess, tag]);

  useEffect(() => {
    if (warDecks.isError && playerId && !fallback) {
      setActivePlayerTag(null);
      navigate('/', {
        replace: true,
        state: {
          tagError: "Couldn't load that player. Check your tag or try again.",
          badTag: playerId,
        },
      });
    }
  }, [warDecks.isError, playerId]);

  const handleSearch = (playerTag: string) => {
    navigate(`/${playerTag.replace(/#/g, '')}`);
  };

  const handleNewSearch = () => {
    setActivePlayerTag(null);
    navigate('/');
  };

  const theme = getTheme();

  if (!metaReady) {
    if (!meta.isError) return <WarDecksSkeleton isMobile={isMobile} />;

    return (
      <div style={styles.centerContent}>
        <h1>Royale DeckLab</h1>
        <p style={{ ...styles.error, color: '#ff6b6b' }}>
          Can't reach the server right now; please try again in a moment.
        </p>
        <button
          onClick={() => meta.refetch()}
          style={{ ...styles.button, backgroundColor: theme.accent, color: theme.onAccent }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return playerData ? (
    <WarDeckResult
      playerName={playerData.player.name}
      decks={playerData.warDecks.decks}
      alternatives={playerData.warDecks.alternatives}
      onNewSearch={handleNewSearch}
      options={options}
      onOptionsChange={handleOptionsChange}
      cards={pickerCards}
      isUpdating={!optionsFailed && (query !== debouncedQuery || warDecks.isPlaceholderData)}
      updateFailed={optionsFailed}
      onRetry={() => warDecks.refetch()}
    />
  ) : tag || activePlayerTag ? (
    <WarDecksSkeleton isMobile={isMobile} />
  ) : (
    <PlayerSearch onSearch={handleSearch} isLoading={warDecks.isFetching} />
  );
}

const styles = {
  centerContent: {
    maxWidth: '600px',
    margin: '80px auto',
    textAlign: 'center' as const,
  },
  subtitle: {
    fontSize: '16px',
    marginTop: '12px',
  },
  button: {
    padding: '14px 32px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginTop: '20px',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0, 123, 255, 0.2)',
  },
  error: {
    color: '#d32f2f',
    marginTop: '20px',
    fontSize: '16px',
  },
};
