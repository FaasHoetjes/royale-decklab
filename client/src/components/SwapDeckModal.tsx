import { useEffect, useMemo } from 'react';
import type { DeckCardData } from '../api';
import { versionOf, cardIconUrl, avgElixir, orderBySlots, alignToReference, slotVersionOf, type CardVersionRef } from '../lib/cardDisplay';
import { classifyDeck } from '../lib/archetypes';
import { CARD_BACKDROP } from '../lib/slotStyles';
import { useIsMobile } from '../hooks/useIsMobile';

export interface SwapOption {
  master: number;
  cards: DeckCardData[];
  metaWinRate: number;
  playerScore: number;
  /** Games the win rate is based on. */
  uses: number;
  cardVersions?: CardVersionRef[];
  metaCardVersions?: CardVersionRef[];
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

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // The current deck first, then the rest by score; each is compared with the current deck.
  const current = options.find((o) => o.master === currentMaster);
  const ordered = useMemo(
    () => [...(current ? [current] : []), ...options.filter((o) => o !== current).sort((a, b) => b.playerScore - a.playerScore)],
    [options, current]
  );
  const currentOrder = current ? orderBySlots(current.cards, slotVersionOf(current.metaCardVersions, current.cardVersions)) : [];
  const currentIds = new Set(currentOrder.map((c) => c.id));
  const sameAsCurrent = (opt: SwapOption, cardId: number) =>
    current != null &&
    currentIds.has(cardId) &&
    versionOf(opt.cardVersions, cardId) === versionOf(current.cardVersions, cardId);
  const others = ordered.length - (current ? 1 : 0);

  return (
    <div
      style={{ ...styles.overlay, padding: isMobile ? '14px 10px' : '40px 20px' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Choose a deck for slot ${slotNumber}`}
    >
      <div
        style={{ ...styles.panel, maxHeight: isMobile ? 'calc(100dvh - 28px)' : 'calc(100vh - 80px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...styles.header, padding: isMobile ? '16px 16px 10px' : '20px 22px 12px' }}>
          <div>
            <h3 style={styles.title}>Swap deck {slotNumber}</h3>
            <p style={styles.subtitle}>
              {others} deck{others === 1 ? '' : 's'} that don't share cards with your other decks. New and changed cards are outlined.
            </p>
          </div>
          <button className="mobile-touch-target" type="button" onClick={onClose} aria-label="Close" style={styles.close}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div style={{ ...styles.list, padding: isMobile ? '4px 12px 14px' : '4px 22px 22px' }}>
          {ordered.map((opt) => {
            const isCurrent = opt === current;
            const delta = current ? opt.playerScore - current.playerScore : 0;
            return (
              <button
                key={opt.master}
                type="button"
                className="swap-option"
                onClick={() => onSelect(opt.master)}
                aria-current={isCurrent || undefined}
                style={{ ...styles.option, ...(isCurrent && styles.optionCurrent) }}
              >
                <div style={styles.line}>
                  <span style={styles.name}>{classifyDeck(opt.cards).name}</span>
                  {isCurrent && <span style={styles.currentBadge}>Current</span>}
                  <span style={{ ...styles.stats, ...(isMobile && styles.statsMobile) }}>
                    <span style={styles.stat}>
                      Score <b style={styles.statValue}>{opt.playerScore.toFixed(3)}</b>
                      {!isCurrent && current && (
                        <span style={{ ...styles.delta, color: delta >= 0 ? 'var(--accent)' : 'var(--text-secondary)' }}>
                          {delta >= 0 ? '+' : '−'}{Math.abs(delta).toFixed(3)}
                        </span>
                      )}
                    </span>
                    <span style={styles.stat}>
                      Win rate <b style={styles.statValue}>{(opt.metaWinRate * 100).toFixed(1)}%</b>
                      <span style={styles.games}>{opt.uses} game{opt.uses === 1 ? '' : 's'}</span>
                    </span>
                    <span style={styles.stat}>
                      Elixir <b style={styles.statValue}>{avgElixir(opt.cards).toFixed(1)}</b>
                    </span>
                  </span>
                </div>
                <div style={{ ...styles.cards, gap: isMobile ? '4px' : '6px' }}>
                  {(isCurrent ? currentOrder : alignToReference(opt.cards, slotVersionOf(opt.metaCardVersions, opt.cardVersions), currentOrder)).map((card) => {
                    const icon = cardIconUrl(card.iconUrls, versionOf(opt.cardVersions, card.id));
                    const isNew = !isCurrent && current != null && !sameAsCurrent(opt, card.id);
                    const isSame = !isCurrent && current != null && !isNew;
                    return (
                      <div
                        key={card.id}
                        title={card.name}
                        style={{ ...styles.miniCard, background: CARD_BACKDROP, ...(isSame && styles.miniSame), ...(isNew && styles.miniNew) }}
                      >
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
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    zIndex: 2000,
  },
  panel: {
    width: '100%',
    maxWidth: '640px',
    borderRadius: '18px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--modal-bg)',
    color: 'var(--text-primary)',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.35)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    overflow: 'hidden' as const,
  },
  header: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700 as const,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '14px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  close: {
    flex: 'none',
    width: '36px',
    height: '36px',
    display: 'grid' as const,
    placeItems: 'center' as const,
    border: 0,
    borderRadius: '10px',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  list: {
    display: 'grid' as const,
    gridAutoRows: 'max-content',
    gap: '12px',
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    flex: 1,
  },
  option: {
    width: '100%',
    textAlign: 'left' as const,
    padding: '16px',
    display: 'grid' as const,
    gap: '12px',
    border: '1px solid var(--panel-border)',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-secondary)',
    boxShadow: 'var(--panel-shadow)',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  optionCurrent: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent), var(--panel-shadow)',
  },
  line: {
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: '4px 10px',
  },
  name: {
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  currentBadge: {
    padding: '2px 8px',
    borderRadius: '999px',
    border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--accent)',
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  stats: {
    marginLeft: 'auto',
    display: 'flex' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: '4px 14px',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  statsMobile: {
    marginLeft: 0,
    width: '100%',
    gap: '4px 12px',
    fontSize: '12px',
  },
  stat: {
    whiteSpace: 'nowrap' as const,
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  delta: {
    marginLeft: '5px',
    fontSize: '12px',
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  games: {
    marginLeft: '5px',
    fontSize: '12px',
    fontWeight: 500 as const,
    color: 'var(--text-tertiary)',
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
  },
  miniCard: {
    aspectRatio: '0.82',
    borderRadius: '6px',
    overflow: 'hidden' as const,
  },
  miniSame: {
    opacity: 0.32,
    filter: 'grayscale(0.6)',
  },
  miniNew: {
    boxShadow: '0 0 0 2px var(--accent)',
  },
  miniCardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    display: 'block',
  },
};
