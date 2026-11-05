import { useEffect, useRef, useState } from 'react';
import type { GeneratorOptions } from '../../lib/generatorOptions';
import { BanIcon, CrossIcon, PlusIcon } from './icons';
import { decksLabel, type PickerKind } from './labels';
import { DeckSegment, KeptCount, LevelSegment } from './SegmentedChoice';

/** Phone: decks and level are batched here and applied with one button, so each tap isn't a request. */
export default function OptionsSheet({ options, levels, cardsLoaded, canReset, onApply, onPickCards, onReset, onClose }: {
  options: GeneratorOptions;
  levels: number[];
  cardsLoaded: boolean;
  canReset: boolean;
  onApply: (patch: Pick<GeneratorOptions, 'decks' | 'minLevel'>) => void;
  onPickCards: (kind: PickerKind, patch: Pick<GeneratorOptions, 'decks' | 'minLevel'>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [decks, setDecks] = useState(options.decks);
  const [minLevel, setMinLevel] = useState(options.minLevel);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The parent re-renders while the sheet is open (e.g. "updating"); keep the effect from re-running.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <>
      <div className="gc-backdrop" style={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="gc-sheet-title" className="gc-sheet" style={styles.sheet}>
        <div aria-hidden="true" style={styles.handle} />
        <div style={styles.sheetHeader}>
          <h2 id="gc-sheet-title" style={styles.sheetTitle}>Customize</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="mobile-touch-target" style={styles.close}>
            <CrossIcon size={16} />
          </button>
        </div>

        <div style={{ ...styles.label, marginBottom: '8px' }}>Number of decks</div>
        <DeckSegment value={decks} onPick={setDecks} />

        <div style={{ ...styles.menuHeader, marginTop: '18px' }}>
          <span style={styles.label}>Minimum card level</span>
          <KeptCount levels={levels} min={minLevel} />
        </div>
        <LevelSegment levels={levels} value={minLevel} onPick={setMinLevel} />

        <div style={{ ...styles.label, marginTop: '18px' }}>Cards</div>
        <div style={styles.cardButtons}>
          <button type="button" disabled={!cardsLoaded} onClick={() => onPickCards('require', { decks, minLevel })} style={styles.cardButton}>
            <PlusIcon />
            Include…
          </button>
          <button type="button" disabled={!cardsLoaded} onClick={() => onPickCards('ban', { decks, minLevel })} style={styles.cardButton}>
            <BanIcon />
            Exclude…
          </button>
        </div>

        <div style={styles.sheetFooter}>
          {canReset && (
            <button type="button" onClick={onReset} className="mobile-touch-target" style={styles.reset}>
              Reset all
            </button>
          )}
          <button type="button" onClick={() => onApply({ decks, minLevel })} style={styles.apply}>
            Show {decksLabel(decks)}
          </button>
        </div>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1500,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    position: 'fixed' as const,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1501,
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    padding: '10px 16px calc(16px + env(safe-area-inset-bottom))',
    borderRadius: '22px 22px 0 0',
    backgroundColor: 'var(--modal-bg)',
    borderTop: '1px solid var(--border-strong)',
    color: 'var(--text-primary)',
  },
  handle: {
    width: '40px',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: 'var(--border-strong)',
    margin: '0 auto 8px',
  },
  sheetHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '10px',
  },
  sheetTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700 as const,
  },
  close: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    border: 0,
    background: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  cardButtons: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    marginTop: '8px',
  },
  cardButton: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    height: '46px',
    borderRadius: '12px',
    border: '1px dashed var(--border-strong)',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
  sheetFooter: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    marginTop: '22px',
  },
  apply: {
    flex: 1,
    height: '50px',
    border: 0,
    borderRadius: '14px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: '16px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  menuHeader: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '12px',
    margin: '2px 4px 10px',
  },
  reset: {
    flexShrink: 0,
    border: 0,
    background: 'none',
    color: 'var(--accent)',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    padding: '4px 6px',
  },
};
