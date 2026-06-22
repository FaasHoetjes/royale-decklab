import { useEffect } from 'react';

interface Card {
  id: number;
  name: string;
  level: number;
  maxLevel: number;
  elixirCost?: number;
  elixerCost?: number;
  iconUrls?: {
    medium?: string;
    evolutionMedium?: string;
    heroMedium?: string;
  };
}

interface CardVersionRef {
  cardId: number;
  version: 'normal' | 'evo' | 'hero';
}

export interface SwapOption {
  // Stable identity used to mark the active deck and to report the choice back.
  master: number;
  cards: Card[];
  metaWinRate: number;
  confidence: number;
  playerScore: number;
  cardVersions?: CardVersionRef[];
}

interface SwapDeckModalProps {
  slotNumber: number;
  options: SwapOption[];
  currentMaster: number;
  isDarkMode: boolean;
  onSelect: (master: number) => void;
  onClose: () => void;
}

const BEATDOWN_TANKS = ['Golem', 'Lava Hound', 'Electro Giant', 'Giant', 'Goblin Giant'];

const elixirOf = (c: Card) => (c.elixirCost ?? c.elixerCost) ?? 0;

// Same at-a-glance heuristic as DeckCard, kept in sync intentionally: a heavy
// tank with high average elixir reads as Beatdown, a very cheap deck as Cycle.
function describeDeck(cards: Card[]): { avgElixir: string; archetype: string } {
  const avg = cards.length > 0
    ? cards.reduce((sum, c) => sum + elixirOf(c), 0) / cards.length
    : 0;
  const hasBeatdownTank = cards.some(c => BEATDOWN_TANKS.includes(c.name));
  const archetype = hasBeatdownTank && avg >= 3.8
    ? 'Beatdown'
    : avg <= 3.2
      ? 'Cycle'
      : 'Control';
  return { avgElixir: avg.toFixed(1), archetype };
}

export default function SwapDeckModal({
  slotNumber,
  options,
  currentMaster,
  isDarkMode,
  onSelect,
  onClose,
}: SwapDeckModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const theme = {
    overlay: 'rgba(0, 0, 0, 0.65)',
    panelBg: isDarkMode ? '#161618' : '#ffffff',
    panelBorder: isDarkMode ? '#2a2a2e' : '#e0e0e0',
    text: isDarkMode ? '#f4f4f5' : '#000000',
    subtext: isDarkMode ? '#a1a1aa' : '#666',
    // Gold in dark mode, blue in light — the one accent, kept to the win rate
    // and the active marker so the picker matches the deck cards.
    accent: isDarkMode ? '#e8b24a' : '#007bff',
    rowBg: isDarkMode ? '#1c1c1f' : '#f8f9ff',
    rowBorder: isDarkMode ? '#2a2a2e' : '#e0e0e0',
    // The selected deck reads from a neutral elevated fill + a gold border,
    // never a blue-tinted surface.
    activeBorder: isDarkMode ? '#e8b24a' : '#007bff',
    activeBg: isDarkMode ? '#26262a' : '#eaf3ff',
  };

  const versionOf = (opt: SwapOption, cardId: number): 'normal' | 'evo' | 'hero' =>
    opt.cardVersions?.find(v => v.cardId === cardId)?.version ?? 'normal';

  const iconFor = (opt: SwapOption, card: Card): string => {
    const { medium, evolutionMedium, heroMedium } = card.iconUrls || {};
    const version = versionOf(opt, card.id);
    if (version === 'hero') return heroMedium || evolutionMedium || medium || '';
    if (version === 'evo') return evolutionMedium || medium || '';
    return medium || '';
  };

  return (
    <div
      style={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose a deck for slot ${slotNumber}`}
    >
      <div
        style={{ ...styles.panel, backgroundColor: theme.panelBg, borderColor: theme.panelBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.panelHeader}>
          <h3 style={{ ...styles.panelTitle, color: theme.text }}>Swap Deck {slotNumber}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ ...styles.closeButton, color: theme.subtext }}
          >
            ✕
          </button>
        </div>
        <p style={{ ...styles.panelSubtitle, color: theme.subtext }}>
          {options.length} option{options.length === 1 ? '' : 's'} that don't share cards with your other decks. Click one to use it.
        </p>

        <div style={styles.optionList}>
          {options.map((opt) => {
            const { avgElixir, archetype } = describeDeck(opt.cards);
            const isActive = opt.master === currentMaster;
            return (
              <button
                key={opt.master}
                type="button"
                onClick={() => onSelect(opt.master)}
                style={{
                  ...styles.option,
                  backgroundColor: isActive ? theme.activeBg : theme.rowBg,
                  borderColor: isActive ? theme.activeBorder : theme.rowBorder,
                }}
              >
                <div style={styles.optionStats}>
                  <span style={{ ...styles.optionArchetype, borderColor: theme.rowBorder, color: theme.subtext }}>
                    {archetype}
                  </span>
                  {isActive && (
                    <span style={{ ...styles.activeTag, color: theme.accent }}>● Current</span>
                  )}
                  <span style={styles.statSpacer} />
                  <span style={styles.optionStat}>
                    <span style={{ ...styles.optionStatLabel, color: theme.subtext }}>Win Rate</span>
                    <span style={{ ...styles.optionStatValue, color: theme.accent }}>
                      {(opt.metaWinRate * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span style={styles.optionStat}>
                    <span style={{ ...styles.optionStatLabel, color: theme.subtext }}>Score</span>
                    <span style={{ ...styles.optionStatValue, color: theme.text }}>
                      {opt.playerScore.toFixed(3)}
                    </span>
                  </span>
                  <span style={styles.optionStat}>
                    <span style={{ ...styles.optionStatLabel, color: theme.subtext }}>Avg Elixir</span>
                    <span style={{ ...styles.optionStatValue, color: theme.text }}>{avgElixir}</span>
                  </span>
                </div>
                <div style={styles.optionCards}>
                  {opt.cards.map((card) => {
                    const icon = iconFor(opt, card);
                    return (
                      <div key={card.id} style={styles.miniCard} title={card.name}>
                        {icon && <img src={icon} alt={card.name} style={styles.miniCardImage} />}
                      </div>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'center' as const,
    padding: '40px 20px',
    overflowY: 'auto' as const,
    zIndex: 100,
  },
  panel: {
    width: '100%',
    maxWidth: '640px',
    borderRadius: '12px',
    border: '1px solid',
    padding: '24px',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
    // Cap the panel to the viewport (matching the overlay's 40px top/bottom
    // padding) so it never grows past the screen. The header + subtitle stay
    // fixed and only the option list below scrolls.
    maxHeight: 'calc(100vh - 80px)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  },
  panelHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  panelTitle: {
    margin: 0,
    fontSize: '20px',
  },
  closeButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '4px',
  },
  panelSubtitle: {
    margin: '6px 0 20px',
    fontSize: '13px',
  },
  optionList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
    // Only the list scrolls; the header/subtitle above stay put. The negative
    // margin + matching padding give the scrollbar room without clipping the
    // option borders against the panel edge.
    overflowY: 'auto' as const,
    flex: 1,
    margin: '0 -4px',
    padding: '4px',
  },
  option: {
    width: '100%',
    textAlign: 'left' as const,
    border: '2px solid',
    borderRadius: '10px',
    padding: '14px 16px',
    cursor: 'pointer',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
    transition: 'border-color 0.15s ease, background-color 0.15s ease',
  },
  optionStats: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '16px',
  },
  optionArchetype: {
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    padding: '3px 9px',
    borderRadius: '999px',
    border: '1.5px solid',
  },
  activeTag: {
    fontSize: '11px',
    fontWeight: 700 as const,
  },
  statSpacer: {
    flex: 1,
  },
  optionStat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
  },
  optionStatLabel: {
    fontSize: '10px',
    fontWeight: 500 as const,
  },
  optionStatValue: {
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  optionCards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: '6px',
  },
  miniCard: {
    aspectRatio: '0.82',
    borderRadius: '6px',
    overflow: 'hidden' as const,
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
  },
  miniCardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
};
