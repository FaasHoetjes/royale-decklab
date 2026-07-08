import type { BestDeckEntry } from '../api';
import type { Theme } from '../theme';
import { versionOf, cardIconUrl, avgElixir, orderBySlots } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import CardTile from './CardTile';
import InfoTip from './InfoTip';

interface CompactDeckRowProps {
  deck: BestDeckEntry;
  theme: Theme;
  isMobile: boolean;
}

/** One deck as a single compact row: 8 cards, inline stats, open-in-game. */
export default function CompactDeckRow({ deck, theme, isMobile }: CompactDeckRowProps) {
  const cards = orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id));
  const accent = theme.accent;

  return (
    <div
      style={{
        ...styles.row,
        // On phones the cards take the full width and the stats wrap beneath.
        flexWrap: isMobile ? ('wrap' as const) : ('nowrap' as const),
        gap: isMobile ? '8px' : '14px',
        padding: isMobile ? '10px' : '10px 14px',
        backgroundColor: 'var(--row-bg)',
        borderColor: 'var(--row-border)',
      }}
    >
      <div
        style={
          isMobile
            ? { display: 'grid' as const, gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', flexBasis: '100%' }
            : { display: 'flex' as const, gap: '5px', flex: 1 }
        }
      >
        {cards.map((card, index) => (
          <div key={card.id} style={styles.cardCell} title={card.name}>
            <CardTile
              name={card.name}
              iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
              slotIndex={index}
              elixirCost={card.elixirCost}
              nameColor={theme.text.primary}
            />
          </div>
        ))}
      </div>

      <div style={{ ...styles.stats, ...(isMobile ? { flex: 1, justifyContent: 'space-around' as const } : {}) }}>
        <Stat label="Win Rate" value={`${(deck.winRate * 100).toFixed(1)}%`} color={accent} theme={theme} />
        <div style={styles.stat}>
          <div style={{ ...styles.statLabel, color: theme.text.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            Meta Score
            <InfoTip ariaLabel="Meta score details" color={theme.text.secondary} width={210}>
              Confidence-adjusted win rate × popularity weight. Higher means this deck both wins more <em>and</em> is run by more top war players.
            </InfoTip>
          </div>
          <div style={{ ...styles.statValue, color: theme.text.primary }}>{deck.metaScore.toFixed(3)}</div>
        </div>
        <Stat label="Avg Elixir" value={avgElixir(deck.cards).toFixed(1)} color={theme.text.primary} theme={theme} />
      </div>

      <a
        href={buildDeckLink(cards.map((c) => c.id))}
        target="_blank"
        rel="noopener noreferrer"
        className="deck-swap-btn"
        title="Open this deck in Clash Royale"
        aria-label="Open this deck in Clash Royale"
        style={{
          ...styles.openInGame,
          border: '1px solid var(--chip-border)',
          backgroundColor: 'var(--float-btn-bg)',
          color: accent,
        }}
      >
        <svg viewBox="0 0 24 24" style={styles.openInGameIcon} aria-hidden="true">
          <path fill="currentColor" d="M8 5v14l11-7z" />
        </svg>
      </a>
    </div>
  );
}

function Stat({ label, value, color, theme }: { label: string; value: string; color: string; theme: Theme }) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statLabel, color: theme.text.secondary }}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    borderRadius: '12px',
    border: '1px solid',
  },
  cardCell: {
    flex: 1,
    minWidth: 0,
  },
  stats: {
    display: 'flex' as const,
    gap: '18px',
    flexShrink: 0,
  },
  stat: {
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: 600 as const,
    letterSpacing: '0.4px',
    textTransform: 'uppercase' as const,
    marginBottom: '3px',
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  openInGame: {
    flexShrink: 0,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    textDecoration: 'none',
    boxShadow: '0 2px 6px rgba(13, 27, 62, 0.12)',
  },
  openInGameIcon: {
    width: '14px',
    height: '14px',
    display: 'block',
  },
};
