import { useState } from 'react';
import type { GeneratorOptions } from '../../lib/generatorOptions';
import Sheet from '../Sheet';
import { BanIcon, PlusIcon } from './icons';
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

  const footer = (
    <div style={styles.sheetFooter}>
      {canReset && (
        <button type="button" onClick={onReset} className="mobile-touch-target" style={styles.reset}>
          Reset all
        </button>
      )}
      <button type="button" onClick={() => onApply({ decks, minLevel })} className="sheet-btn sheet-btn-primary">
        Show {decksLabel(decks)}
      </button>
    </div>
  );

  return (
    <Sheet title="Customize" footer={footer} onClose={onClose}>
      <div style={{ ...styles.label, margin: '6px 0 8px' }}>Number of decks</div>
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
    </Sheet>
  );
}

const styles = {
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
