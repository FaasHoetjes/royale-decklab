interface Card {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  elixerCost?: number;
  evolutionLevel?: number;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

interface DeckCardProps {
  cards: Card[];
  metaWinRate: number;
  playerScore: number;
  deckNumber: number;
  isDarkMode: boolean;
}

export default function DeckCard({
  cards,
  metaWinRate,
  playerScore,
  deckNumber,
  isDarkMode,
}: DeckCardProps) {
  const getDisplayLevel = (card: Card) => {
    const offset = 16 - card.maxLevel;
    return card.level + offset;
  };

  const getCardVersionSuffix = (card: Card, slotIndex: number): string => {
    const hasEvo = (card.evolutionLevel ?? 0) > 0;
    const hasHero = !!card.iconUrls?.heroMedium;

    if (slotIndex === 0) {
      return (hasEvo && card.iconUrls?.evolutionMedium) ? '-ev1' : '';
    } else if (slotIndex === 1) {
      return (hasHero && card.iconUrls?.heroMedium) ? '-hero' : '';
    } else if (slotIndex === 2) {
      if (hasHero && card.iconUrls?.heroMedium) {
        return '-hero';
      } else if (hasEvo && card.iconUrls?.evolutionMedium) {
        return '-ev1';
      }
      return '';
    }
    return '';
  };

  const getRoyaleAPIUrl = (cardName: string, versionSuffix: string): string => {
    const normalizedName = cardName.toLowerCase().replace(/\s+/g, '-');
    return `https://royaleapi.com/card/${normalizedName}${versionSuffix}`;
  };

  const getCardIcon = (card: Card, slotIndex: number): string => {
    const { medium, evolutionMedium, heroMedium } = card.iconUrls || {};
    const hasEvo = (card.evolutionLevel ?? 0) > 0;
    const hasHero = !!heroMedium;

    if (slotIndex === 0) {
      // Slot 1: Show EVO only if player has it, else NORMAL
      return (hasEvo && evolutionMedium) || medium || '';
    } else if (slotIndex === 1) {
      // Slot 2: Show HERO only if player has it, else NORMAL
      return (hasHero && heroMedium) || medium || '';
    } else if (slotIndex === 2) {
      // Slot 3: Show HERO if player has it, else EVO if player has it, else NORMAL
      return (hasHero && heroMedium) || (hasEvo && evolutionMedium) || medium || '';
    } else {
      // Slots 4+: Show NORMAL
      return medium || '';
    }
  };

  const theme = {
    containerBg: isDarkMode ? '#222222' : '#ffffff',
    containerBorder: isDarkMode ? '#444444' : '#007bff',
    headerBg: isDarkMode ? '#1a1a1a' : '#ffffff',
    headerBorder: isDarkMode ? '#444444' : '#007bff',
    headerText: isDarkMode ? '#ffffff' : '#000000',
    statsBg: isDarkMode ? '#2a2a2a' : '#f8f9ff',
    statsText: isDarkMode ? '#ffffff' : '#000000',
    statsLabel: isDarkMode ? '#aaaaaa' : '#666',
    statsValue: isDarkMode ? '#4a9eff' : '#007bff',
    cardBg: isDarkMode ? '#2a2a2a' : '#f8f9ff',
    cardBorder: isDarkMode ? '#444444' : '#e0e0e0',
    cardText: isDarkMode ? '#ffffff' : '#000000',
    cardSecondaryText: isDarkMode ? '#aaaaaa' : '#666',
  };

  const avgElixir = cards.length > 0
    ? (cards.reduce((sum, c) => sum + ((c.elixirCost || c.elixerCost) || 0), 0) / cards.length).toFixed(1)
    : '0';

  return (
    <div style={{ ...styles.container, backgroundColor: theme.containerBg, borderColor: theme.containerBorder }}>
      <div style={{ ...styles.header, borderBottomColor: theme.headerBorder }}>
        <h3 style={{ color: theme.headerText }}>Deck {deckNumber}</h3>
      </div>

      <div style={{ ...styles.stats, backgroundColor: theme.statsBg }}>
        <div style={styles.stat}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>Meta Win Rate</span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{(metaWinRate * 100).toFixed(1)}%</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>Player Score</span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{playerScore.toFixed(3)}</span>
        </div>
        <div style={styles.stat}>
          <span style={{ ...styles.statLabel, color: theme.statsLabel }}>Avg Elixir</span>
          <span style={{ ...styles.statValue, color: theme.statsValue }}>{avgElixir}</span>
        </div>
      </div>

      <div style={styles.cards}>
        {cards.map((card, index) => {
          const iconUrl = getCardIcon(card, index);
          const versionSuffix = getCardVersionSuffix(card, index);
          const royaleAPIUrl = getRoyaleAPIUrl(card.name, versionSuffix);
          return (
            <a
              key={card.id}
              href={royaleAPIUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.cardLink}
              title={`${card.name} · Level ${getDisplayLevel(card)}/16`}
            >
              <div style={{ ...styles.card, backgroundColor: theme.cardBg, borderColor: theme.cardBorder }}>
                {iconUrl && (
                  <img
                    src={iconUrl}
                    alt={card.name}
                    style={styles.cardImage}
                  />
                )}
                <div style={styles.cardElixir}>
                  <svg viewBox="0 0 28 30" style={styles.cardElixirDrop} aria-hidden="true">
                    <defs>
                      <radialGradient id="elixirGrad" cx="36%" cy="62%" r="70%">
                        <stop offset="0%" stopColor="#f6a8ff" />
                        <stop offset="45%" stopColor="#d63bd6" />
                        <stop offset="100%" stopColor="#a0149e" />
                      </radialGradient>
                    </defs>
                    <path
                      d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                      fill="url(#elixirGrad)"
                      stroke="#000000"
                      strokeWidth="1.6"
                    />
                    <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
                  </svg>
                  <span style={styles.cardElixirText}>{card.elixirCost || card.elixerCost}</span>
                </div>
                <div style={styles.cardLevel}>LEVEL {getDisplayLevel(card)}</div>
              </div>
              <div style={{ ...styles.cardName, color: theme.cardText }}>{card.name}</div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    border: '2px solid #007bff',
    borderRadius: '12px',
    padding: '25px',
    backgroundColor: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 123, 255, 0.1)',
  },
  header: {
    marginBottom: '20px',
    borderBottom: '3px solid #007bff',
    paddingBottom: '15px',
  },
  stats: {
    display: 'flex' as const,
    justifyContent: 'space-around',
    marginBottom: '25px',
    padding: '15px',
    backgroundColor: '#f8f9ff',
    borderRadius: '8px',
    gap: '20px',
  },
  stat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  statLabel: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px',
    fontWeight: '500' as const,
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#007bff',
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    maxWidth: '520px',
    margin: '0 auto',
  },
  cardLink: {
    textDecoration: 'none',
    cursor: 'pointer',
    display: 'block',
  },
  card: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '2px solid rgba(0, 0, 0, 0.15)',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
  },
  cardImage: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  cardElixir: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
  },
  cardElixirDrop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  cardElixirText: {
    position: 'absolute' as const,
    left: 0,
    right: '8%',
    top: '60%',
    transform: 'translateY(-50%)',
    textAlign: 'center' as const,
    color: 'white',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  },
  cardLevel: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    color: 'white',
    fontSize: '11px',
    fontWeight: 800 as const,
    letterSpacing: '0.5px',
    textAlign: 'center' as const,
    padding: '12px 0 4px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
  },
  cardName: {
    fontWeight: '600' as const,
    fontSize: '10px',
    textAlign: 'center' as const,
    marginTop: '5px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
};
