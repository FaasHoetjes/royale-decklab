import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { fetchPlayerWarDecks, fetchMetaStatus } from '../api';
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

export default function WarDeckGenerator() {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const { isDarkMode, activePlayerTag, setActivePlayerTag } = useApp();
  const [isLoading, setIsLoading] = useState(!!playerId);
  const [error, setError] = useState('');
  const [playerData, setPlayerData] = useState<PlayerResponse | null>(null);
  const [metaReady, setMetaReady] = useState(false);

  useEffect(() => {
    checkMetaStatus();
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
      handleSearch(`#${playerId}`);
    }
  }, [metaReady, playerId]);

  const checkMetaStatus = async () => {
    try {
      await fetchMetaStatus();
      setMetaReady(true);
    } catch (error) {
      setError(
        'Failed to connect to server. Make sure the backend is running on port 3000.'
      );
      setMetaReady(false);
    }
  };

  const handleSearch = async (playerTag: string) => {
    setIsLoading(true);
    setError('');
    setPlayerData(null);

    try {
      const data = await fetchPlayerWarDecks(playerTag);
      setPlayerData(data);

      // Make this player active app-wide (used by the War Deck Builder).
      setActivePlayerTag(playerTag);

      // Update URL
      const tag = playerTag.replace('#', '');
      navigate(`/${tag}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch player data. Please try again.'
      );
    } finally {
      setIsLoading(false);
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
          onClick={checkMetaStatus}
          style={{ ...styles.button, backgroundColor: theme.accent, color: theme.onAccent }}
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <>
      {!playerData ? (
        <PlayerSearch onSearch={handleSearch} isLoading={isLoading} isDarkMode={isDarkMode} />
      ) : (
        <WarDeckResult
          playerName={playerData.player.name}
          decks={playerData.warDecks.decks}
          alternatives={playerData.warDecks.alternatives}
          totalScore={playerData.warDecks.totalScore}
          onNewSearch={handleNewSearch}
          isDarkMode={isDarkMode}
        />
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
