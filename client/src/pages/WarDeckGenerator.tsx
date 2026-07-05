import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { useMetaStatus, usePlayerWarDecks } from '../queries';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();

  // The URL is the source of truth for which player to show; searching just
  // navigates and lets the query below react to the new tag.
  const tag = playerId ? `#${playerId}` : null;

  // Backend readiness. staleTime:Infinity means a remount won't re-flash the
  // "connecting" screen once it has answered this session.
  const meta = useMetaStatus();
  const metaReady = meta.isSuccess;

  // The player's war decks, keyed by tag. The query cache replaces the old
  // per-tag Map, so revisiting a loaded player paints instantly. Held off until
  // the backend is confirmed up.
  const warDecks = usePlayerWarDecks(tag, metaReady);
  const playerData = warDecks.data ?? null;

  // Reached the generator without a tag in the URL but a player is active
  // (e.g. landed on '/'), so load that player's page.
  useEffect(() => {
    if (!playerId && activePlayerTag) {
      navigate(`/${activePlayerTag.replace(/#/g, '')}`, { replace: true });
    }
  }, [playerId, activePlayerTag]);

  // Once a tag's decks load successfully, make that player active app-wide
  // (used by the Builder + Best Decks). Only on success so a bad tag doesn't
  // poison the active player.
  useEffect(() => {
    if (warDecks.isSuccess && tag) setActivePlayerTag(tag);
  }, [warDecks.isSuccess, tag]);

  const handleSearch = (playerTag: string) => {
    // Navigate; the query re-keys on the new tag and (cache permitting) may
    // resolve instantly. Strip every '#': a mid-string one would become a URL
    // fragment and route to a truncated tag.
    navigate(`/${playerTag.replace(/#/g, '')}`);
  };

  const handleNewSearch = () => {
    // Clearing the active player returns the app to the landing page.
    setActivePlayerTag(null);
    navigate('/');
  };

  const theme = getTheme(isDarkMode);

  if (!metaReady) {
    return (
      <div style={styles.centerContent}>
        <h1>Royale DeckLab</h1>
        <p style={{ ...styles.error, color: '#ff6b6b' }}>
          {meta.isError
            ? "Can't reach the server right now; please try again in a moment."
            : 'Connecting to server...'}
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

  const searchError = warDecks.isError
    ? warDecks.error instanceof Error
      ? warDecks.error.message
      : 'Failed to fetch player data. Please try again.'
    : '';

  return (
    <>
      {playerData ? (
        <WarDeckResult
          playerName={playerData.player.name}
          decks={playerData.warDecks.decks}
          alternatives={playerData.warDecks.alternatives}
          onNewSearch={handleNewSearch}
          isDarkMode={isDarkMode}
        />
      ) : (tag || activePlayerTag) && !searchError ? (
        // A player is being loaded (from the URL, or the redirect above is
        // about to fire). Show a loader, not the empty search form, which
        // would otherwise flash for a moment before results arrive.
        <div style={styles.centerContent}>
          <h1>Royale DeckLab</h1>
          <p style={{ ...styles.subtitle, color: theme.text.secondary }}>Loading your war decks…</p>
        </div>
      ) : (
        <PlayerSearch onSearch={handleSearch} isLoading={warDecks.isFetching} isDarkMode={isDarkMode} />
      )}
      {searchError && <div style={{ ...styles.errorBanner, backgroundColor: '#ff6b6b' }}>{searchError}</div>}
    </>
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
  errorBanner: {
    position: 'fixed' as const,
    bottom: '20px',
    // Anchored to both edges with a max width so it hugs the right on desktop
    // but never overflows a phone screen.
    left: '20px',
    right: '20px',
    marginLeft: 'auto' as const,
    width: 'fit-content' as const,
    backgroundColor: '#d32f2f',
    color: 'white',
    padding: '16px 20px',
    borderRadius: '8px',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
  },
};
