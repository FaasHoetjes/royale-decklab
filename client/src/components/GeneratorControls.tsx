import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BuilderCard } from '../lib/builderCards';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import { MAX_DECKS, MAX_LEVEL, type GeneratorOptions } from '../lib/generatorOptions';
import { loadPickerPrefs, savePickerPrefs, type FilterKey } from '../lib/pickerData';
import CardPicker from './CardPicker';

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

type PickerKind = 'ban' | 'require';
type Menu = 'decks' | 'level' | 'add';
type Tone = 'plain' | 'active' | 'ban' | 'require' | 'add';

const LOWEST_LEVEL_CHOICE = 10;
const LEVEL_CHOICES: (number | null)[] = [
  null,
  ...Array.from({ length: MAX_LEVEL - LOWEST_LEVEL_CHOICE + 1 }, (_, i) => LOWEST_LEVEL_CHOICE + i),
];
const DECK_CHOICES = Array.from({ length: MAX_DECKS }, (_, i) => i + 1);
// The picker outlines picked cards in these; the pills use the theme's --ban-text / --require-text.
const BAN_COLOR = '#d64545';
const REQUIRE_COLOR = '#1f8a4c';

const decksLabel = (n: number) => `${n} deck${n === 1 ? '' : 's'}`;
const levelLabel = (min: number | null) => (min == null ? 'Any level' : `Level ${min}+`);
const levelOf = (card: BuilderCard | undefined) =>
  card?.owned && card.level != null && card.maxLevel != null ? displayLevel(card.level, card.maxLevel) : null;

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

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const ownedLevels = useMemo(() => cards.map(levelOf).filter((l): l is number => l != null), [cards]);
  const cardsLoaded = cards.length > 0;

  // Menus close on a click outside them or on Escape, which also returns focus to the pill.
  const anchors = useRef<Record<Menu, HTMLSpanElement | null>>({ decks: null, level: null, add: null });
  useEffect(() => {
    if (!menu) return;
    const anchor = anchors.current[menu];
    anchor?.querySelector<HTMLElement>('[role="menu"] [role="menuitem"], [aria-checked="true"]')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!anchor?.contains(e.target as Node)) setMenu(null);
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
  const toggleCard = (kind: PickerKind, id: number) => {
    const list = options[kind];
    set({ [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };
  const openPicker = (kind: PickerKind) => {
    setMenu(null);
    setSheetOpen(false);
    setPicker(kind);
  };

  const tooLow = options.minLevel == null
    ? []
    : options.require.filter((id) => (levelOf(cardById.get(id)) ?? 0) < (options.minLevel ?? 0));

  const cardPill = (kind: PickerKind, id: number) => {
    const card = cardById.get(id);
    const name = card?.name ?? `Card ${id}`;
    return (
      <span key={`${kind}-${id}`} className="gc-chip-in" style={{ ...pill(kind, isMobile), paddingLeft: '4px', cursor: 'default' }}>
        {card ? (
          <img src={cardIconUrl(card.iconUrls, 'normal')} alt="" style={{ ...styles.avatar, filter: kind === 'ban' ? 'grayscale(0.85)' : undefined }} />
        ) : null}
        {kind === 'ban' ? `No ${name}` : `With ${name}`}
        <button
          type="button"
          onClick={() => toggleCard(kind, id)}
          aria-label={kind === 'ban' ? `Allow ${name} again` : `Stop requiring ${name}`}
          className="mobile-touch-hitbox"
          style={styles.remove}
        >
          <CrossIcon />
        </button>
      </span>
    );
  };
  const cardPills = [...options.ban.map((id) => cardPill('ban', id)), ...options.require.map((id) => cardPill('require', id))];

  const menuPill = (key: Menu, label: ReactNode, tone: Tone, content: ReactNode, width: number, hasPopup: 'dialog' | 'menu' = 'dialog') => (
    <span ref={(el) => { anchors.current[key] = el; }} style={styles.anchor}>
      <button
        type="button"
        className="gc-pill"
        aria-haspopup={hasPopup}
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
        <div role="group" aria-label="Customize your decks" className="gc-scroll" style={styles.scrollRow}>
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
          {cardPills}
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
            230
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
            360
          )}
          {cardPills}
          {menuPill(
            'add',
            <>
              <PlusIcon />
              Add card
            </>,
            'add',
            <div role="menu" aria-label="Add a card rule">
              <button type="button" role="menuitem" className="gc-option" onClick={() => openPicker('require')} style={styles.option}>
                <span style={{ ...styles.optionIcon, color: 'var(--require-text)' }}><PlusIcon /></span>
                Always use a card…
              </button>
              <button type="button" role="menuitem" className="gc-option" onClick={() => openPicker('ban')} style={styles.option}>
                <span style={{ ...styles.optionIcon, color: 'var(--ban-text)' }}><BanIcon /></span>
                Never use a card…
              </button>
            </div>,
            230,
            'menu'
          )}
          <span style={styles.status}>
            {isUpdating && <span style={styles.updating}>Updating…</span>}
            {reset}
          </span>
        </div>
      )}

      {tooLow.length > 0 && (
        <p style={styles.warning} role="status">
          {tooLow.map((id) => `${cardById.get(id)?.name ?? 'A card'} (level ${levelOf(cardById.get(id))})`).join(', ')}{' '}
          {tooLow.length === 1 ? 'is' : 'are'} below your minimum level of {options.minLevel}, so no deck can include{' '}
          {tooLow.length === 1 ? 'it' : 'them'}. Lower the minimum level or remove the requirement.
        </p>
      )}

      {sheetOpen && (
        <OptionsSheet
          options={options}
          levels={ownedLevels}
          cardsLoaded={cardsLoaded}
          canReset={canReset}
          onApply={(patch) => {
            if (patch.decks !== options.decks || patch.minLevel !== options.minLevel) {
              set({ ...patch, lock: options.lock.slice(0, patch.decks) });
            }
            setSheetOpen(false);
          }}
          onPickCards={(kind, patch) => {
            if (patch.decks !== options.decks || patch.minLevel !== options.minLevel) {
              set({ ...patch, lock: options.lock.slice(0, patch.decks) });
            }
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
          usedLabel={picker === 'ban' ? 'required' : 'banned'}
          selectedIds={new Set(options[picker])}
          selectedColor={picker === 'ban' ? BAN_COLOR : REQUIRE_COLOR}
          title={picker === 'ban' ? 'Never use' : 'Always use'}
          subtitle={
            picker === 'ban'
              ? 'Decks with these cards are never picked.'
              : 'Each of these cards is used in one of your decks.'
          }
          onSelect={(id) => toggleCard(picker, id)}
          onClose={() => setPicker(null)}
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

/** A row of choices with a highlight that slides to the pick. */
function Segment<T>({ label, choices, value, onPick, text, ariaLabel, dim }: {
  label: string;
  choices: T[];
  value: T;
  onPick: (choice: T) => void;
  text: (choice: T) => string;
  ariaLabel?: (choice: T) => string;
  dim?: (choice: T) => boolean;
}) {
  const index = Math.max(0, choices.indexOf(value));
  return (
    <div role="radiogroup" aria-label={label} style={{ ...styles.segment, gridTemplateColumns: `repeat(${choices.length}, minmax(0, 1fr))` }}>
      <span
        aria-hidden="true"
        className="gc-thumb"
        style={{ ...styles.thumb, width: `calc((100% - 6px) / ${choices.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {choices.map((choice, i) => (
        <button
          key={text(choice)}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={ariaLabel?.(choice)}
          onClick={() => onPick(choice)}
          style={{
            ...styles.segmentButton,
            fontSize: choices.length > 4 ? '14px' : '16px',
            color: i === index ? 'var(--on-accent)' : dim?.(choice) ? 'var(--text-tertiary)' : 'var(--text-primary)',
          }}
        >
          {text(choice)}
        </button>
      ))}
    </div>
  );
}

function DeckSegment({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return <Segment label="Number of decks" choices={DECK_CHOICES} value={value} onPick={onPick} text={String} />;
}

/** Any | 10 … 16, plus a bar that fills with the share of the player's cards a minimum keeps. */
function LevelSegment({ levels, value, onPick }: {
  levels: number[];
  value: number | null;
  onPick: (min: number | null) => void;
}) {
  const keptAt = (min: number | null) => (min == null ? levels.length : levels.filter((l) => l >= min).length);
  const share = levels.length === 0 ? 1 : keptAt(value) / levels.length;
  return (
    <>
      <Segment
        label="Minimum card level"
        choices={LEVEL_CHOICES}
        value={value}
        onPick={onPick}
        text={(choice) => (choice == null ? 'Any' : String(choice))}
        ariaLabel={(choice) => `${choice == null ? 'Any level' : `Level ${choice} and up`}: keeps ${keptAt(choice)} of your cards`}
        dim={(choice) => value != null && (choice == null || choice < value)}
      />
      <div aria-hidden="true" style={styles.keptTrack}>
        <span className="gc-kept" style={{ ...styles.keptFill, width: `${share * 100}%` }} />
      </div>
    </>
  );
}

function KeptCount({ levels, min }: { levels: number[]; min: number | null }) {
  if (levels.length === 0) return null;
  const kept = min == null ? levels.length : levels.filter((l) => l >= min).length;
  return <span style={styles.keptCount}>{kept} of {levels.length} cards</span>;
}

/** Phone: decks and level are batched here and applied with one button, so each tap isn't a request. */
function OptionsSheet({ options, levels, cardsLoaded, canReset, onApply, onPickCards, onReset, onClose }: {
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
            <span style={{ color: 'var(--require-text)' }}><PlusIcon /></span>
            Always use…
          </button>
          <button type="button" disabled={!cardsLoaded} onClick={() => onPickCards('ban', { decks, minLevel })} style={styles.cardButton}>
            <span style={{ color: 'var(--ban-text)' }}><BanIcon /></span>
            Never use…
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
    case 'ban':
    case 'require': {
      const ink = tone === 'ban' ? 'var(--ban-text)' : 'var(--require-text)';
      return {
        ...base,
        color: ink,
        borderColor: `color-mix(in srgb, ${ink} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${ink} 12%, var(--bg-secondary))`,
        paddingRight: '4px',
      };
    }
    case 'add':
      return { ...base, borderStyle: 'dashed', backgroundColor: 'transparent' };
    default:
      return base;
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : undefined }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CrossIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="10" cy="17" r="2" />
    </svg>
  );
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
    WebkitMaskImage: 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)',
    maskImage: 'linear-gradient(90deg, #000 calc(100% - 28px), transparent)',
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
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '0.4px',
    textTransform: 'uppercase' as const,
    color: 'var(--stat-label)',
  },
  keptCount: {
    fontSize: '13px',
    fontWeight: 700 as const,
    color: 'var(--accent)',
  },
  option: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    width: '100%',
    padding: '10px',
    border: 0,
    borderRadius: '10px',
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: '14px',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  optionIcon: {
    display: 'inline-flex' as const,
    width: '22px',
    justifyContent: 'center' as const,
  },
  keptTrack: {
    height: '6px',
    margin: '12px 2px 2px',
    borderRadius: '99px',
    backgroundColor: 'var(--bg-tertiary)',
    overflow: 'hidden' as const,
  },
  keptFill: {
    display: 'block',
    height: '100%',
    borderRadius: 'inherit',
    backgroundColor: 'var(--accent)',
  },
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    objectPosition: 'top',
  },
  remove: {
    width: '28px',
    height: '28px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    border: 0,
    borderRadius: '50%',
    background: 'none',
    color: 'inherit',
    cursor: 'pointer',
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
    fontWeight: 700 as const,
    cursor: 'pointer',
    padding: '4px 6px',
  },
  warning: {
    margin: '10px 0 0',
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#b26a00',
  },
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
    fontWeight: 800 as const,
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
  segment: {
    position: 'relative' as const,
    display: 'grid' as const,
    padding: '3px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  thumb: {
    position: 'absolute' as const,
    top: '3px',
    bottom: '3px',
    left: '3px',
    borderRadius: '9px',
    backgroundColor: 'var(--accent)',
  },
  segmentButton: {
    position: 'relative' as const,
    height: '42px',
    border: 0,
    background: 'none',
    fontSize: '16px',
    fontWeight: 800 as const,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
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
    fontWeight: 800 as const,
    cursor: 'pointer',
  },
};
