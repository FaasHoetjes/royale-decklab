import DeckCard from './DeckCard';

interface Card {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  elixerCost?: number;
}

interface ScoredDeck {
  cardIds: number[];
  metaWinRate: number;
  confidence: number;
  uses: number;
  players: number;
  pickRate: number;
  playerScore: number;
  cardVersions?: Array<{ cardId: number; version: 'normal' | 'evo' | 'hero' }>;
  cards: Card[];
}

interface WarDeckResultProps {
  playerName: string;
  decks: ScoredDeck[];
  totalScore: number;
  onNewSearch: () => void;
  isDarkMode: boolean;
}

export default function WarDeckResult({
  playerName,
  decks,
  totalScore,
  onNewSearch,
  isDarkMode,
}: WarDeckResultProps) {
  const theme = {
    headerBg: isDarkMode ? '#2a2a2a' : '#ffffff',
    headerBorder: isDarkMode ? '#444444' : '#ddd',
    headerText: isDarkMode ? '#ffffff' : '#000000',
    buttonBg: isDarkMode ? '#4a9eff' : '#007bff',
  };

  if (decks.length === 0) {
    return (
      <div style={styles.container}>
        <p style={styles.error}>
          Could not find 4 non-overlapping decks for your card collection.
          Try getting more cards!
        </p>
        <button onClick={onNewSearch} style={{ ...styles.button, backgroundColor: theme.buttonBg }}>
          Search Another Player
        </button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.headerBorder }}>
        <h2 style={{ color: theme.headerText }}>{playerName}'s Best War Decks</h2>
        <p style={{ ...styles.totalScore, color: theme.headerText }}>
          Total Score: <strong>{totalScore.toFixed(3)}</strong>
        </p>
      </div>

      <div style={styles.decksGrid}>
        {decks.map((deck, index) => (
          <DeckCard
            key={index}
            cards={deck.cards}
            metaWinRate={deck.metaWinRate}
            confidence={deck.confidence}
            uses={deck.uses}
            players={deck.players}
            pickRate={deck.pickRate}
            cardVersions={deck.cardVersions}
            playerScore={deck.playerScore}
            deckNumber={index + 1}
            isDarkMode={isDarkMode}
          />
        ))}
      </div>

      <div style={{ ...styles.footer, borderTopColor: theme.headerBorder }}>
        <button onClick={onNewSearch} style={{ ...styles.button, backgroundColor: theme.buttonBg }}>
          Search Another Player
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '40px 20px',
    maxWidth: '900px',
    margin: '0 auto',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: '50px',
    paddingBottom: '30px',
    borderBottom: '3px solid #007bff',
  },
  totalScore: {
    fontSize: '22px',
    color: '#333',
    marginTop: '15px',
    fontWeight: '500' as const,
  },
  decksGrid: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    gap: '30px',
    marginBottom: '50px',
  },
  footer: {
    textAlign: 'center' as const,
    paddingTop: '30px',
    borderTop: '2px solid #ddd',
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
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 8px rgba(0, 123, 255, 0.2)',
  },
  error: {
    color: '#d32f2f',
    padding: '30px',
    textAlign: 'center' as const,
    fontSize: '16px',
  },
};
