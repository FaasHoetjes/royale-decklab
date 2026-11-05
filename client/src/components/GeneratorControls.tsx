import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BuilderCard } from '../lib/builderCards';
import { displayLevel } from '../lib/cardDisplay';
import { MAX_DECKS, type GeneratorOptions } from '../lib/generatorOptions';
import { loadPickerPrefs, savePickerPrefs, type FilterKey } from '../lib/pickerData';
import CardPicker from './CardPicker';
import CardAvatar from './generator/CardAvatar';
import OptionsSheet from './generator/OptionsSheet';
import PickedCards from './generator/PickedCards';
import { DeckSegment, KeptCount, LevelSegment } from './generator/SegmentedChoice';
import { BanIcon, ChevronIcon, PlusIcon, SlidersIcon } from './generator/icons';
import { decksLabel, type PickerKind } from './generator/labels';

interface GeneratorControlsProps {
  options: GeneratorOptions;
  onChange: (options: GeneratorOptions) => void;
  /** Catalog marked with the player's collection; empty while it loads. */
  cards: BuilderCard[];
  isUpdating: boolean;
  isMobile: boolean;
  /** Options are set or decks were swapped, so there is something to reset. */
  canReset: boolean;
  onReset: () => void;
}

type Menu = 'decks' | 'level';
type Tone = 'plain' | 'active' | 'add';

// Include uses the accent; Exclude stays grey with a ⊘, so the two read apart without extra colours.
const RULES: Record<PickerKind, { label: string; subtitle: string; usedLabel: string }> = {
  require: { label: 'Include', subtitle: 'Each of these cards goes in one of your decks.', usedLabel: 'excluded' },
  ban: { label: 'Exclude', subtitle: 'Decks with these cards are skipped.', usedLabel: 'included' },
};

const levelLabel = (min: number | null) => (min == null ? 'Any level' : `Level ${min}+`);
const levelOf = (card: BuilderCard | undefined) =>
  card?.owned && card.level != null && card.maxLevel != null ? displayLevel(card.level, card.maxLevel) : null;
const DECK_MENU_WIDTH = 230;
const LEVEL_MENU_WIDTH = 360;

function rulePillTone(kind: PickerKind, hasCards: boolean): Tone {
  if (!hasCards) return 'add';
  return kind === 'require' ? 'active' : 'plain';
}

function ruleIcon(kind: PickerKind) {
  return kind === 'require' ? <PlusIcon /> : <BanIcon />;
}

export default function GeneratorControls({ options, onChange, cards, isUpdating, isMobile, canReset, onReset }: GeneratorControlsProps) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [initialPrefs] = useState(loadPickerPrefs);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set(initialPrefs.filters));
  const [sortIndex, setSortIndex] = useState(initialPrefs.sortIndex);
  const [descending, setDescending] = useState(initialPrefs.descending);
  useEffect(() => {
    savePickerPrefs({ filters: [...filters], sortIndex, descending });
  }, [filters, sortIndex, descending]);

  // The phone pill row scrolls sideways; a fade on the right hints at the pills past the edge.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  useEffect(() => {
    const row = scrollRef.current;
    if (!row) return;
    const update = () => setMoreRight(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    update();
    row.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [isMobile]);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const ownedLevels = useMemo(() => cards.map(levelOf).filter((l): l is number => l != null), [cards]);
  const cardsLoaded = cards.length > 0;

  // Menus close on a click outside them or on Escape, which also returns focus to the pill.
  const anchors = useRef<Record<Menu, HTMLSpanElement | null>>({ decks: null, level: null });
  useEffect(() => {
    if (!menu) return;
    const anchor = anchors.current[menu];
    anchor?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (!anchor?.contains(target)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenu(null);
      anchor?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const set = (patch: Partial<GeneratorOptions>) => onChange({ ...options, ...patch });
  // The picker collects its picks and applies them once when it closes: the decks are hidden behind it,
  // so fetching after every tap would only spend requests on lineups nobody sees.
  const [picks, setPicks] = useState<number[]>([]);
  const togglePick = (id: number) =>
    setPicks((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  const openPicker = (kind: PickerKind) => {
    setMenu(null);
    setSheetOpen(false);
    setPicks(options[kind]);
    setPicker(kind);
  };
  const closePicker = () => {
    if (picker) {
      const before = options[picker];
      if (picks.length !== before.length || picks.some((id, i) => id !== before[i])) set({ [picker]: picks });
    }
    setPicker(null);
  };
  const cardName = (id: number) => cardById.get(id)?.name ?? `Card ${id}`;
  const applySheetPatch = (patch: Pick<GeneratorOptions, 'decks' | 'minLevel'>) => {
    if (patch.decks !== options.decks || patch.minLevel !== options.minLevel) {
      set({ ...patch, lock: options.lock.slice(0, patch.decks) });
    }
  };

  const tooLow = options.minLevel == null
    ? []
    : options.require.filter((id) => (levelOf(cardById.get(id)) ?? 0) < (options.minLevel ?? 0));
  const isSingle = tooLow.length === 1;
  const verb = isSingle ? 'is' : 'are';
  const pronoun = isSingle ? 'it' : 'them';

  // One pill per rule, showing its cards; it opens the picker straight away.
  const rulePill = (kind: PickerKind) => {
    const ids = options[kind];
    const { label } = RULES[kind];
    return (
      <button
        key={kind}
        type="button"
        className="gc-pill"
        aria-haspopup="dialog"
        aria-label={ids.length ? `${label}: ${ids.map(cardName).join(', ')}` : `${label} a card`}
        disabled={!cardsLoaded}
        onClick={() => openPicker(kind)}
        style={{
          ...pill(rulePillTone(kind, ids.length > 0), isMobile),
          ...(ids.length ? { padding: '0 12px 0 6px' } : {}),
        }}
      >
        {ids.length ? (
          <span style={styles.stack} aria-hidden="true">
            {ids.slice(0, 3).map((id, i) => (
              <CardAvatar key={id} card={cardById.get(id)} dim={kind === 'ban'} style={i > 0 ? styles.stacked : undefined} />
            ))}
          </span>
        ) : (
          ruleIcon(kind)
        )}
        {label}
        {ids.length > 0 && <span style={{ ...styles.count, ...(kind === 'ban' ? styles.countMuted : {}) }}>{ids.length}</span>}
      </button>
    );
  };
  const rulePills = [rulePill('require'), rulePill('ban')];

  const menuPill = (key: Menu, label: ReactNode, tone: Tone, content: ReactNode, width: number) => (
    <span ref={(el) => { anchors.current[key] = el; }} style={styles.anchor}>
      <button
        type="button"
        className="gc-pill"
        aria-haspopup="dialog"
        aria-expanded={menu === key}
        disabled={key !== 'decks' && !cardsLoaded}
        onClick={() => setMenu((m) => (m === key ? null : key))}
        style={pill(tone, isMobile)}
      >
        {label}
        <ChevronIcon open={menu === key} />
      </button>
      {menu === key && (
        <div className="gc-menu" style={{ ...styles.menu, width: `${width}px` }}>
          {content}
        </div>
      )}
    </span>
  );

  const reset = canReset && (
    <button type="button" onClick={onReset} title="Back to the decks generated without options or swaps" className="mobile-touch-target" style={styles.reset}>
      Reset
    </button>
  );

  return (
    <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
      {isMobile ? (
        <div ref={scrollRef} role="group" aria-label="Customize your decks" className="gc-scroll" style={{ ...styles.scrollRow, ...(moreRight && styles.scrollFade) }}>
          <button type="button" className="gc-pill" onClick={() => setSheetOpen(true)} aria-label="Customize your decks" style={pill('plain', true)}>
            <SlidersIcon />
            Customize
          </button>
          <button type="button" className="gc-pill" onClick={() => setSheetOpen(true)} style={pill(options.decks !== MAX_DECKS ? 'active' : 'plain', true)}>
            {decksLabel(options.decks)}
          </button>
          <button type="button" className="gc-pill" onClick={() => setSheetOpen(true)} style={pill(options.minLevel != null ? 'active' : 'plain', true)}>
            {levelLabel(options.minLevel)}
          </button>
          {rulePills}
          {reset}
        </div>
      ) : (
        <div role="group" aria-label="Customize your decks" style={styles.row}>
          {menuPill(
            'decks',
            decksLabel(options.decks),
            options.decks !== MAX_DECKS ? 'active' : 'plain',
            <>
              <div style={styles.menuHeader}>
                <span style={styles.label}>Number of decks</span>
              </div>
              <DeckSegment value={options.decks} onPick={(n) => set({ decks: n, lock: options.lock.slice(0, n) })} />
            </>,
            DECK_MENU_WIDTH
          )}
          {menuPill(
            'level',
            levelLabel(options.minLevel),
            options.minLevel != null ? 'active' : 'plain',
            <>
              <div style={styles.menuHeader}>
                <span style={styles.label}>Minimum card level</span>
                <KeptCount levels={ownedLevels} min={options.minLevel} />
              </div>
              <LevelSegment levels={ownedLevels} value={options.minLevel} onPick={(minLevel) => set({ minLevel })} />
            </>,
            LEVEL_MENU_WIDTH
          )}
          {rulePills}
          <span style={styles.status}>
            {isUpdating && <span style={styles.updating}>Updating…</span>}
            {reset}
          </span>
        </div>
      )}

      {tooLow.length > 0 && (
        <p style={styles.warning} role="status">
          {tooLow.map((id) => `${cardById.get(id)?.name ?? 'A card'} (level ${levelOf(cardById.get(id))})`).join(', ')}{' '}
          {verb} below your minimum level of {options.minLevel}, so no deck can include{' '}
          {pronoun}. Lower the minimum level or stop including {pronoun}.
        </p>
      )}

      {sheetOpen && (
        <OptionsSheet
          options={options}
          levels={ownedLevels}
          cardsLoaded={cardsLoaded}
          canReset={canReset}
          onApply={(patch) => {
            applySheetPatch(patch);
            setSheetOpen(false);
          }}
          onPickCards={(kind, patch) => {
            applySheetPatch(patch);
            openPicker(kind);
          }}
          onReset={() => {
            onReset();
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}

      {picker && (
        <CardPicker
          cards={cards}
          usedIds={new Set(picker === 'ban' ? options.require : options.ban)}
          usedLabel={RULES[picker].usedLabel}
          selectedIds={new Set(picks)}
          selectedColor={picker === 'ban' ? 'var(--text-secondary)' : 'var(--accent)'}
          selectedMarkColor={picker === 'ban' ? 'var(--bg-primary)' : 'var(--on-accent)'}
          selectedMark={picker === 'ban' ? <BanIcon /> : <PlusIcon />}
          dimSelected={picker === 'ban'}
          title={RULES[picker].label}
          subtitle={RULES[picker].subtitle}
          topContent={
            picks.length > 0 && (
              <PickedCards
                picks={picks}
                cardById={cardById}
                cardName={cardName}
                label={RULES[picker].label}
                dim={picker === 'ban'}
                onRemove={togglePick}
              />
            )
          }
          footer={
            <div style={styles.pickerFooter}>
              <span style={styles.pickerCount}>
                {picks.length === 0 ? 'No cards picked' : `${picks.length} card${picks.length === 1 ? '' : 's'} ${picker === 'ban' ? 'excluded' : 'included'}`}
              </span>
              {/* Closing any other way keeps the picks too; this is the obvious way to finish. */}
              <button type="button" onClick={closePicker} style={styles.done}>
                Done
              </button>
            </div>
          }
          onSelect={togglePick}
          onClose={closePicker}
          filters={filters}
          setFilters={setFilters}
          sortIndex={sortIndex}
          setSortIndex={setSortIndex}
          descending={descending}
          setDescending={setDescending}
          allowChampions
        />
      )}
    </div>
  );
}

function pill(tone: Tone, isMobile: boolean): CSSProperties {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
    height: isMobile ? '44px' : '40px',
    padding: '0 12px 0 14px',
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border-strong)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  };
  switch (tone) {
    case 'active':
      return {
        ...base,
        color: 'var(--accent)',
        borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--accent) 13%, var(--bg-secondary))',
      };
    case 'add':
      return { ...base, borderStyle: 'dashed', backgroundColor: 'transparent' };
    default:
      return base;
  }
}

const styles = {
  row: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: '8px',
  },
  scrollRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    overflowX: 'auto' as const,
    paddingBottom: '2px',
  },
  scrollFade: {
    WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 56px), transparent)',
    maskImage: 'linear-gradient(90deg, #000 calc(100% - 56px), transparent)',
  },
  anchor: {
    position: 'relative' as const,
    display: 'inline-flex' as const,
  },
  menu: {
    position: 'absolute' as const,
    zIndex: 50,
    top: 'calc(100% + 8px)',
    left: 0,
    padding: '10px',
    borderRadius: '16px',
    backgroundColor: 'var(--modal-bg)',
    border: '1px solid var(--border-strong)',
    boxShadow: '0 24px 50px rgba(0, 0, 0, 0.35)',
  },
  menuHeader: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '12px',
    margin: '2px 4px 10px',
  },
  label: {
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  stack: {
    display: 'inline-flex' as const,
  },
  stacked: {
    marginLeft: '-10px',
    boxShadow: '0 0 0 2px var(--bg-secondary)',
  },
  count: {
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '99px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: '12px',
    fontWeight: 700 as const,
  },
  countMuted: {
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
  },
  status: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    marginLeft: 'auto',
  },
  updating: {
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
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
  warning: {
    margin: '10px 0 0',
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#b26a00',
  },
  pickerFooter: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
  },
  pickerCount: {
    fontSize: '14px',
    fontWeight: 500 as const,
    color: 'var(--text-secondary)',
  },
  done: {
    height: '44px',
    minWidth: '120px',
    padding: '0 22px',
    border: 0,
    borderRadius: '12px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: '15px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
