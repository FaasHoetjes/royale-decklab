import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PlayerSearch from '../components/PlayerSearch';
import WarDeckResult from '../components/WarDeckResult';
import { useMetaStatus, usePlayerWarDecks } from '../queries';
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

  const meta = useMetaStatus();
  const metaReady = meta.isSuccess;

  const warDecks = usePlayerWarDecks(tag, metaReady);
  const playerData = warDecks.data ?? null;

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
    if (warDecks.isError && playerId) {
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
