import { useEffect, useMemo, useState } from 'react';
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

const LOWEST_LEVEL_CHOICE = 10;
const BAN_COLOR = '#d64545';
const REQUIRE_COLOR = '#1f8a4c';

export default function GeneratorControls({ options, onChange, cards, isUpdating, isMobile, canReset, onReset }: GeneratorControlsProps) {
  const [picker, setPicker] = useState<PickerKind | null>(null);
  const [initialPrefs] = useState(loadPickerPrefs);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set(initialPrefs.filters));
  const [sortIndex, setSortIndex] = useState(initialPrefs.sortIndex);
  const [descending, setDescending] = useState(initialPrefs.descending);
  useEffect(() => {
    savePickerPrefs({ filters: [...filters], sortIndex, descending });
  }, [filters, sortIndex, descending]);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const levelOf = (card: BuilderCard | undefined) =>
    card?.owned && card.level != null && card.maxLevel != null ? displayLevel(card.level, card.maxLevel) : null;

  // How many owned cards each minimum level keeps, so the choice isn't a blind guess.
  const ownedAtLeast = useMemo(() => {
    const levels = cards.map(levelOf).filter((l): l is number => l != null);
    return (min: number) => levels.filter((l) => l >= min).length;
  }, [cards]);

  const set = (patch: Partial<GeneratorOptions>) => onChange({ ...options, ...patch });
  const toggleCard = (kind: PickerKind, id: number) => {
    const list = options[kind];
    set({ [kind]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] });
  };

  const tooLow = options.minLevel == null
    ? []
    : options.require.filter((id) => (levelOf(cardById.get(id)) ?? 0) < (options.minLevel ?? 0));

  const chip = (kind: PickerKind, id: number) => {
    const card = cardById.get(id);
    const name = card?.name ?? `Card ${id}`;
    const color = kind === 'ban' ? BAN_COLOR : REQUIRE_COLOR;
    return (
      <span key={`${kind}-${id}`} style={{ ...styles.chip, color, backgroundColor: `${color}1f` }}>
        {card && <img src={cardIconUrl(card.iconUrls, 'normal')} alt="" style={styles.chipIcon} />}
        {kind === 'ban' ? `No ${name}` : `Use ${name}`}
        <button
          type="button"
          onClick={() => toggleCard(kind, id)}
          aria-label={`Remove ${kind === 'ban' ? 'ban on' : 'requirement for'} ${name}`}
          style={{ ...styles.chipRemove, color }}
        >
          ×
        </button>
      </span>
    );
  };

  const cardsLoaded = cards.length > 0;
  const chips = [...options.ban.map((id) => chip('ban', id)), ...options.require.map((id) => chip('require', id))];

  return (
    <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
      <div
        role="group"
        aria-label="Customize your decks"
        style={{ ...styles.toolbar, gap: isMobile ? '12px 14px' : '12px 18px', padding: isMobile ? '12px' : '12px 14px' }}
      >
        <div style={styles.group}>
          <span style={styles.label}>Decks</span>
          <div style={styles.segment} role="radiogroup" aria-label="Number of decks">
            {Array.from({ length: MAX_DECKS }, (_, i) => i + 1).map((n) => {
              const on = options.decks === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className="mobile-touch-target"
                  onClick={() => set({ decks: n, lock: options.lock.slice(0, n) })}
                  style={{
                    ...styles.segmentButton,
                    ...(n > 1 ? styles.segmentDivider : {}),
                    ...(on ? styles.segmentOn : {}),
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <label style={styles.group}>
          <span style={styles.label}>Min level</span>
          <select
            value={options.minLevel ?? ''}
            onChange={(e) => set({ minLevel: e.target.value ? Number(e.target.value) : null })}
            style={styles.select}
          >
            <option value="">Any level</option>
            {Array.from({ length: MAX_LEVEL - LOWEST_LEVEL_CHOICE + 1 }, (_, i) => LOWEST_LEVEL_CHOICE + i).map((lvl) => (
              <option key={lvl} value={lvl}>
                Level {lvl}+{cardsLoaded ? ` · ${ownedAtLeast(lvl)} cards` : ''}
              </option>
            ))}
          </select>
        </label>

        <div style={styles.group}>
          <button
            type="button"
            className="mobile-touch-target"
            disabled={!cardsLoaded}
            onClick={() => setPicker('ban')}
            style={styles.pillButton}
          >
            ⊘ Ban cards{options.ban.length ? ` (${options.ban.length})` : ''}
          </button>
          <button
            type="button"
            className="mobile-touch-target"
            disabled={!cardsLoaded}
            onClick={() => setPicker('require')}
            style={styles.pillButton}
          >
            ＋ Must include{options.require.length ? ` (${options.require.length})` : ''}
          </button>
        </div>

        <div style={styles.status}>
          {isUpdating && <span style={styles.updating}>Updating…</span>}
          {canReset && (
            <button
              type="button"
              className="mobile-touch-target"
              onClick={onReset}
              title="Back to the decks generated without options or swaps"
              style={styles.reset}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && <div style={styles.chips}>{chips}</div>}

      {tooLow.length > 0 && (
        <p style={styles.warning} role="status">
          {tooLow.map((id) => `${cardById.get(id)?.name ?? 'A card'} (level ${levelOf(cardById.get(id))})`).join(', ')}{' '}
          {tooLow.length === 1 ? 'is' : 'are'} below your minimum level of {options.minLevel}, so no deck can include{' '}
          {tooLow.length === 1 ? 'it' : 'them'}. Lower the minimum level or remove the requirement.
        </p>
      )}

      {picker && (
        <CardPicker
          cards={cards}
          usedIds={new Set(picker === 'ban' ? options.require : options.ban)}
          usedLabel={picker === 'ban' ? 'required' : 'banned'}
          selectedIds={new Set(options[picker])}
          selectedColor={picker === 'ban' ? BAN_COLOR : REQUIRE_COLOR}
          title={picker === 'ban' ? 'Ban cards' : 'Must include'}
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

const styles = {
  toolbar: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    borderRadius: '12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  group: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '0.4px',
    textTransform: 'uppercase' as const,
    color: 'var(--stat-label)',
  },
  segment: {
    display: 'inline-flex' as const,
    border: '1px solid var(--control-border)',
    borderRadius: '9px',
    overflow: 'hidden' as const,
    backgroundColor: 'var(--control-bg)',
  },
  segmentButton: {
    border: 0,
    background: 'none',
    color: 'var(--control-text)',
    padding: '7px 12px',
    minWidth: '36px',
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
  segmentDivider: {
    borderLeft: '1px solid var(--control-border)',
  },
  segmentOn: {
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
  select: {
    fontSize: '13px',
    fontWeight: 600 as const,
    padding: '7px 10px',
    borderRadius: '9px',
    border: '1px solid var(--control-border)',
    backgroundColor: 'var(--control-bg)',
    color: 'var(--control-text)',
    cursor: 'pointer',
  },
  pillButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    border: '1px dashed var(--border-strong)',
    backgroundColor: 'var(--control-bg)',
    color: 'var(--control-text)',
    borderRadius: '999px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: 600 as const,
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
    border: 0,
    background: 'none',
    color: 'var(--accent)',
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
    padding: '4px 2px',
  },
  chips: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '6px',
    marginTop: '10px',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
    borderRadius: '999px',
    padding: '3px 6px 3px 3px',
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  chipIcon: {
    width: '20px',
    height: '24px',
    objectFit: 'contain' as const,
  },
  chipRemove: {
    border: 0,
    background: 'none',
    fontSize: '15px',
    lineHeight: 1,
    padding: '0 3px',
    cursor: 'pointer',
  },
  warning: {
    margin: '10px 0 0',
    fontSize: '13px',
    lineHeight: 1.5,
    color: '#b26a00',
  },
};
