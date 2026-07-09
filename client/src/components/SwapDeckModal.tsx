import { useEffect } from 'react';
import type { DeckCardData } from '../api';
import { versionOf, cardIconUrl, avgElixir, deckArchetype, type CardVersionRef } from '../lib/cardDisplay';
import { CARD_BACKDROP } from '../lib/slotStyles';
import { useIsMobile } from '../hooks/useIsMobile';

export interface SwapOption {
  master: number;
  cards: DeckCardData[];
  metaWinRate: number;
  playerScore: number;
  cardVersions?: CardVersionRef[];
}

interface SwapDeckModalProps {
  slotNumber: number;
  options: SwapOption[];
  currentMaster: number;
  onSelect: (master: number) => void;
  onClose: () => void;
}

export default function SwapDeckModal({
  slotNumber,
  options,
  currentMaster,
  onSelect,
  onClose,
}: SwapDeckModalProps) {
  const isMobile = useIsMobile();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      style={{ ...styles.overlay, padding: isMobile ? '14px 10px' : '40px 20px' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose a deck for slot ${slotNumber}`}
    >
      <div
        style={{
          ...styles.panel,
          padding: isMobile ? '16px 14px' : '24px',
          maxHeight: isMobile ? 'calc(100dvh - 28px)' : 'calc(100vh - 80px)',
          backgroundColor: theme.panelBg,
          borderColor: theme.panelBorder,
        }}
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
                    {deckArchetype(opt.cards)}
                  </span>
                  {isActive && (
                    <span style={{ ...styles.activeTag, color: theme.accent }}>● Current</span>
                  )}
                  <span style={styles.statSpacer} />
                  <OptionStat label="Win Rate" value={`${(opt.metaWinRate * 100).toFixed(1)}%`} labelColor={theme.subtext} valueColor={theme.accent} />
                  <OptionStat label="Score" value={opt.playerScore.toFixed(3)} labelColor={theme.subtext} valueColor={theme.text} />
                  <OptionStat label="Avg Elixir" value={avgElixir(opt.cards).toFixed(1)} labelColor={theme.subtext} valueColor={theme.text} />
                </div>
                <div style={styles.optionCards}>
                  {opt.cards.map((card) => {
                    const icon = cardIconUrl(card.iconUrls, versionOf(opt.cardVersions, card.id));
                    return (
                      <div key={card.id} style={{ ...styles.miniCard, background: CARD_BACKDROP }} title={card.name}>
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

const theme = {
  panelBg: 'var(--modal-bg)',
  panelBorder: 'var(--border)',
  text: 'var(--text-primary)',
  subtext: 'var(--text-secondary)',
  accent: 'var(--accent)',
  rowBg: 'var(--row-bg)',
  rowBorder: 'var(--border)',
  activeBorder: 'var(--accent)',
  activeBg: 'var(--selected-bg)',
};

function OptionStat({ label, value, labelColor, valueColor }: { label: string; value: string; labelColor: string; valueColor: string }) {
  return (
    <span style={styles.optionStat}>
      <span style={{ ...styles.optionStatLabel, color: labelColor }}>{label}</span>
      <span style={{ ...styles.optionStatValue, color: valueColor }}>{value}</span>
    </span>
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
    overflowY: 'auto' as const,
    zIndex: 100,
  },
  // Capped to the viewport; the header + subtitle stay fixed and only the
  // option list below scrolls.
  panel: {
    width: '100%',
    maxWidth: '640px',
    borderRadius: '12px',
    border: '1px solid',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.35)',
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
  // The negative margin + matching padding give the scrollbar room without
  // clipping the option borders against the panel edge.
  optionList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
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
    flexWrap: 'wrap' as const,
    gap: '8px 14px',
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
  },
  miniCardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
};
