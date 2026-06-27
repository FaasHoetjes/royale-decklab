import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { fetchPlayerWarDecks, fetchMetaStatus, isAbortError } from '../api';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';

interface PlayerResponse {
  player: {
    tag: string;
    name: string;
  };
  warDecks: {
    decks: ScoredDeckDTO[];
    totalScore: number;
    alternatives: ScoredDeckDTO[];
  };
}

interface ScoredDeckDTO {
  cardIds: number[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  playerScore: number;
  cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  metaCardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  cards: Array<{
    id: number;
    name: string;
    level: number;
    maxLevel: number;
    elixirCost?: number;
    elixerCost?: number;
  }>;
}

// Cache fetched war decks per player tag for the session, so navigating away
// and back to the generator doesn't re-fetch (and re-show a loader) for a
// player we've already loaded.
const warDeckCache = new Map<string, PlayerResponse>();

// Once the backend has answered, remember it for the session. The meta status
// doesn't change underneath us, so a remount (returning to this page) should
// start already-ready instead of flashing the "Connecting to server…" screen.
let metaReadyOnce = false;

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();
  // Seed from the cache so a remount for an already-loaded player paints the
  // results immediately instead of flashing the loader.
  const initialTag = playerId ? `#${playerId}` : activePlayerTag;
  const [isLoading, setIsLoading] = useState(!!playerId);
  const [error, setError] = useState('');
  const [playerData, setPlayerData] = useState<PlayerResponse | null>(
    () => (initialTag ? warDeckCache.get(initialTag) ?? null : null)
  );
  const [metaReady, setMetaReady] = useState(metaReadyOnce);

  useEffect(() => {
    // Already confirmed this session — no need to re-check (or flash a loader).
    if (metaReadyOnce) return;
    const controller = new AbortController();
    checkMetaStatus(controller.signal);
    return () => controller.abort();
  }, []);

  // Reached the generator without a tag in the URL but a player is active
  // (e.g. landed on '/') — load that player's page.
  useEffect(() => {
    if (!playerId && activePlayerTag) {
      navigate(`/${activePlayerTag.replace('#', '')}`, { replace: true });
    }
  }, [playerId, activePlayerTag]);

  useEffect(() => {
    if (metaReady && playerId) {
      const controller = new AbortController();
      handleSearch(`#${playerId}`, controller.signal);
      return () => controller.abort();
    }
  }, [metaReady, playerId]);

  const checkMetaStatus = async (signal?: AbortSignal) => {
    try {
      await fetchMetaStatus(signal);
      metaReadyOnce = true;
      setMetaReady(true);
    } catch (error) {
      // An aborted check (StrictMode remount / unmount) isn't a connection failure.
      if (isAbortError(error)) return;
      setError(
        'Failed to connect to server. Make sure the backend is running on port 3000.'
      );
      setMetaReady(false);
    }
  };

  const handleSearch = async (playerTag: string, signal?: AbortSignal) => {
    // Serve a previously loaded player instantly from the cache.
    const cached = warDeckCache.get(playerTag);
    if (cached) {
      setPlayerData(cached);
      setActivePlayerTag(playerTag);
      navigate(`/${playerTag.replace('#', '')}`, { replace: true });
      return;
    }

    setIsLoading(true);
    setError('');
    setPlayerData(null);

    try {
      const data = await fetchPlayerWarDecks(playerTag, signal);
      setPlayerData(data);
      warDeckCache.set(playerTag, data);

      // Make this player active app-wide (used by the War Deck Builder).
      setActivePlayerTag(playerTag);

      // Update URL
      const tag = playerTag.replace('#', '');
      navigate(`/${tag}`);
    } catch (err) {
      // A superseded/unmounted request was cancelled on purpose — not an error,
      // and we leave the loader as-is for the request that replaced it.
      if (isAbortError(err)) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch player data. Please try again.'
      );
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const handleNewSearch = () => {
    setPlayerData(null);
    setError('');
    // Clearing the active player returns the app to the landing page.
    setActivePlayerTag(null);
    navigate('/');
  };

  const theme = getTheme(isDarkMode);

  if (!metaReady) {
    return (
      <div style={styles.centerContent}>
        <h1>Royale DeckLab</h1>
        <p style={{ ...styles.error, color: '#ff6b6b' }}>{error || 'Connecting to server...'}</p>
        <button
          onClick={() => checkMetaStatus()}
          style={{ ...styles.button, backgroundColor: theme.accent, color: theme.onAccent }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <>
      {playerData ? (
        <WarDeckResult
          playerName={playerData.player.name}
          decks={playerData.warDecks.decks}
          alternatives={playerData.warDecks.alternatives}
          totalScore={playerData.warDecks.totalScore}
          onNewSearch={handleNewSearch}
          isDarkMode={isDarkMode}
        />
      ) : activePlayerTag && !error ? (
        // We already know the player and are auto-loading their decks (e.g. on
        // returning to this page) — show a loader, not the empty search form,
        // which would otherwise flash for a moment before results arrive.
        <div style={styles.centerContent}>
          <h1>Royale DeckLab</h1>
          <p style={{ ...styles.subtitle, color: theme.text.secondary }}>Loading your war decks…</p>
        </div>
      ) : (
        <PlayerSearch onSearch={handleSearch} isLoading={isLoading} isDarkMode={isDarkMode} />
      )}
      {error && <div style={{ ...styles.errorBanner, backgroundColor: '#ff6b6b' }}>{error}</div>}
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
    right: '20px',
    backgroundColor: '#d32f2f',
    color: 'white',
    padding: '16px 20px',
    borderRadius: '8px',
    maxWidth: '400px',
    boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)',
  },
};
