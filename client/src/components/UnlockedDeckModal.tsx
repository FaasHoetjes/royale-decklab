import { useEffect } from 'react';
import type { BestDeckEntry } from '../api';
import { versionOf, cardIconUrl, avgElixir, orderBySlots } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import { useIsMobile } from '../hooks/useIsMobile';
import CardTile from './CardTile';
import DeckLinkAction from './DeckLinkAction';

interface UnlockedDeckModalProps {
  deck: BestDeckEntry;
  cardName?: string;
  onClose: () => void;
}

export default function UnlockedDeckModal({ deck, cardName, onClose }: UnlockedDeckModalProps) {
  const isMobile = useIsMobile();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const cards = orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id));
  const deckLink = buildDeckLink(cards.map((c) => c.id));

  return (
    <div
      style={{ ...styles.overlay, padding: isMobile ? '14px 10px' : '40px 20px' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Deck this upgrade unlocks"
    >
      <div
        style={{
          ...styles.panel,
          padding: isMobile ? '16px 14px' : '24px',
          backgroundColor: theme.panelBg,
          borderColor: theme.panelBorder,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.panelHeader}>
          <h3 style={{ ...styles.panelTitle, color: theme.text }}>Deck you'd unlock</h3>
          <button
            className="mobile-touch-target"
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ ...styles.closeButton, color: theme.subtext }}
          >
            ✕
          </button>
        </div>
        {cardName && (
          <p style={{ ...styles.panelSubtitle, color: theme.subtext }}>
            Leveling <strong style={{ color: theme.text }}>{cardName}</strong> brings this deck into your recommended lineup.
          </p>
        )}

        <div style={{ ...styles.stats, backgroundColor: theme.statsBg, borderColor: theme.statsBorder }}>
          <Stat label="Win Rate" value={`${(deck.winRate * 100).toFixed(1)}%`} valueColor={theme.accent} />
          <Stat label="Meta Score" value={deck.metaScore.toFixed(3)} valueColor={theme.text} border />
          <Stat label="Avg Elixir" value={avgElixir(deck.cards).toFixed(1)} valueColor={theme.text} border />
        </div>

        <div style={{ ...styles.grid, gap: isMobile ? '10px 8px' : '14px' }}>
          {cards.map((card, index) => (
            <div key={card.id} style={{ minWidth: 0 }} title={card.name}>
              <CardTile
                name={card.name}
                iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
                slotIndex={index}
                elixirCost={card.elixirCost}
                nameColor={theme.text}
              />
            </div>
          ))}
        </div>

        <DeckLinkAction
          link={deckLink}
          isMobile={isMobile}
          className="mobile-touch-target"
          style={{
            ...styles.openInGame,
            borderColor: theme.statsBorder,
            backgroundColor: theme.raisedBg,
            color: theme.accent,
          }}
          label={isMobile ? 'Open in Clash Royale' : 'Copy deck link'}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  valueColor,
  border,
}: {
  label: string;
  value: string;
  valueColor: string;
  border?: boolean;
}) {
  return (
    <div style={{ ...styles.stat, borderLeft: border ? `1px solid ${theme.divider}` : undefined }}>
      <span style={{ ...styles.statLabel, color: theme.subtext }}>{label}</span>
      <span style={{ ...styles.statValue, color: valueColor }}>{value}</span>
    </div>
  );
}

const theme = {
  panelBg: 'var(--modal-bg)',
  panelBorder: 'var(--border)',
  text: 'var(--text-primary)',
  subtext: 'var(--text-secondary)',
  accent: 'var(--accent)',
  statsBg: 'var(--inset-bg)',
  statsBorder: 'var(--row-border)',
  divider: 'var(--row-border)',
  raisedBg: 'var(--raised-bg)',
};

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    zIndex: 2000,
  },
  panel: {
    width: '100%',
    maxWidth: '560px',
    borderRadius: '12px',
    border: '1px solid',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
  },
  panelHeader: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
  },
  panelTitle: {
    margin: '2px 0 0',
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
    margin: '10px 0 0',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  stats: {
    display: 'flex' as const,
    justifyContent: 'space-around',
    margin: '18px 0 20px',
    padding: '12px 10px',
    border: '1px solid',
    borderRadius: '12px',
    gap: '8px',
  },
  stat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    flex: 1,
  },
  statLabel: {
    fontSize: '11px',
    marginBottom: '5px',
    fontWeight: 600 as const,
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, 1fr)',
  },
  openInGame: {
    width: '100%',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    marginTop: '20px',
    padding: '11px 12px',
    border: '1px solid',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 700 as const,
    textDecoration: 'none',
    cursor: 'pointer' as const,
  },
};
