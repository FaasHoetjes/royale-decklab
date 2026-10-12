import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { BuilderCard } from '../lib/builderCards';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import { LOWEST_LEVEL_CHOICE, MAX_DECKS, MAX_LEVEL, type GeneratorOptions } from '../lib/generatorOptions';
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
type Menu = 'decks' | 'level';
type Tone = 'plain' | 'active' | 'add';

const LEVEL_CHOICES: (number | null)[] = [
  null,
  ...Array.from({ length: MAX_LEVEL - LOWEST_LEVEL_CHOICE + 1 }, (_, i) => LOWEST_LEVEL_CHOICE + i),
];
const DECK_CHOICES = Array.from({ length: MAX_DECKS }, (_, i) => i + 1);
// Include uses the accent; Exclude stays grey with a ⊘, so the two read apart without extra colours.
const RULES: Record<PickerKind, { label: string; subtitle: string; usedLabel: string }> = {
  require: { label: 'Include', subtitle: 'Each of these cards goes in one of your decks.', usedLabel: 'excluded' },
  ban: { label: 'Exclude', subtitle: 'Decks with these cards are skipped.', usedLabel: 'included' },
};

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
  const cardName = (id: number) => cardById.get(id)?.name ?? `Card ${id}`;

  const tooLow = options.minLevel == null
    ? []
    : options.require.filter((id) => (levelOf(cardById.get(id)) ?? 0) < (options.minLevel ?? 0));

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
          ...pill(ids.length === 0 ? 'add' : kind === 'require' ? 'active' : 'plain', isMobile),
          ...(ids.length ? { padding: '0 12px 0 6px' } : {}),
        }}
      >
        {ids.length ? (
          <span style={styles.stack} aria-hidden="true">
            {ids.slice(0, 3).map((id, i) => (
              <CardAvatar key={id} card={cardById.get(id)} dim={kind === 'ban'} style={i > 0 ? styles.stacked : undefined} />
            ))}
          </span>
        ) : kind === 'require' ? (
          <PlusIcon />
        ) : (
          <BanIcon />
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
          {tooLow.length === 1 ? 'is' : 'are'} below your minimum level of {options.minLevel}, so no deck can include{' '}
          {tooLow.length === 1 ? 'it' : 'them'}. Lower the minimum level or stop including {tooLow.length === 1 ? 'it' : 'them'}.
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
          usedLabel={RULES[picker].usedLabel}
          selectedIds={new Set(options[picker])}
          selectedColor={picker === 'ban' ? 'var(--text-secondary)' : 'var(--accent)'}
          selectedMarkColor={picker === 'ban' ? 'var(--bg-primary)' : 'var(--on-accent)'}
          selectedMark={picker === 'ban' ? <BanIcon /> : <PlusIcon />}
          dimSelected={picker === 'ban'}
          title={RULES[picker].label}
          subtitle={RULES[picker].subtitle}
          topContent={
            options[picker].length > 0 && (
              <div style={styles.picks} aria-label={`${RULES[picker].label}d cards`}>
                {options[picker].map((id) => (
                  <span key={id} style={styles.pick}>
                    <CardAvatar card={cardById.get(id)} dim={picker === 'ban'} small />
                    {cardName(id)}
                    <button type="button" onClick={() => toggleCard(picker, id)} aria-label={`Remove ${cardName(id)}`} className="mobile-touch-hitbox" style={styles.remove}>
                      <CrossIcon />
                    </button>
                  </span>
                ))}
              </div>
            )
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

function CardAvatar({ card, dim, small, style }: { card: BuilderCard | undefined; dim?: boolean; small?: boolean; style?: CSSProperties }) {
  const size = small ? '24px' : '28px';
  if (!card) return <span style={{ ...styles.avatar, width: size, height: size, backgroundColor: 'var(--bg-tertiary)', ...style }} />;
  return (
    <img
      src={cardIconUrl(card.iconUrls, 'normal')}
      alt=""
      style={{ ...styles.avatar, width: size, height: size, filter: dim ? 'grayscale(1) brightness(0.8)' : undefined, ...style }}
    />
  );
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
  keptCount: {
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--accent)',
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
  picks: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
  },
  pick: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    height: '34px',
    padding: '0 2px 0 4px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
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
    fontWeight: 600 as const,
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
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
