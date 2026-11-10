import { LOWEST_LEVEL_CHOICE, MAX_DECKS, MAX_LEVEL } from '../../lib/generatorOptions';
import { useRovingGroup } from '../../hooks/useRovingGroup';

const LEVEL_CHOICES: (number | null)[] = [
  null,
  ...Array.from({ length: MAX_LEVEL - LOWEST_LEVEL_CHOICE + 1 }, (_, i) => LOWEST_LEVEL_CHOICE + i),
];

const DECK_CHOICES = Array.from({ length: MAX_DECKS }, (_, i) => i + 1);

const countKept = (levels: number[], min: number | null) => (min == null ? levels.length : levels.filter((l) => l >= min).length);

function choiceColor(isSelected: boolean, isDimmed: boolean) {
  if (isSelected) return 'var(--text-primary)';
  return isDimmed ? 'var(--text-tertiary)' : 'var(--text-secondary)';
}

/** A row of choices with a highlight that slides to the pick. */
export function Segment<T>({ label, choices, value, onPick, text, ariaLabel, dim }: {
  label: string;
  choices: T[];
  value: T;
  onPick: (choice: T) => void;
  text: (choice: T) => string;
  ariaLabel?: (choice: T) => string;
  dim?: (choice: T) => boolean;
}) {
  const index = Math.max(0, choices.indexOf(value));
  const { itemRef, onKeyDown } = useRovingGroup(choices.length, (i) => {
    const choice = choices[i];
    if (choice !== undefined) onPick(choice);
  });
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
          ref={itemRef(i)}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          aria-label={ariaLabel?.(choice)}
          onClick={() => onPick(choice)}
          onKeyDown={(e) => onKeyDown(e, i)}
          style={{
            ...styles.segmentButton,
            fontSize: choices.length > 4 ? '14px' : '15px',
            fontWeight: i === index ? 650 : 500,
            color: choiceColor(i === index, dim?.(choice) === true),
          }}
        >
          {text(choice)}
        </button>
      ))}
    </div>
  );
}

export function DeckSegment({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return <Segment label="Number of decks" choices={DECK_CHOICES} value={value} onPick={onPick} text={String} />;
}

export function LevelSegment({ levels, value, onPick }: {
  levels: number[];
  value: number | null;
  onPick: (min: number | null) => void;
}) {
  const keptAt = (min: number | null) => countKept(levels, min);
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

export function KeptCount({ levels, min }: { levels: number[]; min: number | null }) {
  if (levels.length === 0) return null;
  const kept = countKept(levels, min);
  return <span style={styles.keptCount}>{kept} of {levels.length} cards</span>;
}

const styles = {
  segment: {
    position: 'relative' as const,
    display: 'grid' as const,
    padding: '3px',
    borderRadius: '11px',
    backgroundColor: 'color-mix(in srgb, var(--text-primary) 6%, transparent)',
  },
  thumb: {
    position: 'absolute' as const,
    top: '3px',
    bottom: '3px',
    left: '3px',
    borderRadius: '8px',
    backgroundColor: 'var(--segment-thumb)',
    boxShadow: 'var(--segment-thumb-shadow)',
  },
  segmentButton: {
    position: 'relative' as const,
    height: '38px',
    border: 0,
    background: 'none',
    cursor: 'pointer',
    transition: 'color 0.2s ease',
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
  keptCount: {
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--accent)',
  },
};
