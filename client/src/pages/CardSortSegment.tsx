import { CARD_SORTS, type CardSort } from '../lib/cardStats';
import { useRovingGroup } from '../hooks/useRovingGroup';

export function SortSegment({ value, onPick, isMobile }: { value: CardSort; onPick: (sort: CardSort) => void; isMobile: boolean }) {
  const index = CARD_SORTS.indexOf(value);
  const tabStop = Math.max(0, index);
  const { itemRef, onKeyDown } = useRovingGroup(CARD_SORTS.length, (i) => {
    const sort = CARD_SORTS[i];
    if (sort !== undefined) onPick(sort);
  });
  return (
    <div
      role="radiogroup"
      aria-label="Sort cards by"
      style={{ ...styles.segment, gridTemplateColumns: `repeat(${CARD_SORTS.length}, minmax(0, 1fr))`, ...(isMobile ? { width: '100%' } : {}) }}
    >
      <span
        aria-hidden="true"
        className="gc-thumb"
        style={{ ...styles.thumb, width: `calc((100% - 6px) / ${CARD_SORTS.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {CARD_SORTS.map((sort, i) => (
        <button
          key={sort}
          ref={itemRef(i)}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={() => onPick(sort)}
          onKeyDown={(e) => onKeyDown(e, i)}
          style={{ ...styles.segmentButton, color: i === index ? 'var(--on-accent)' : 'var(--text-primary)' }}
        >
          {sort}
        </button>
      ))}
    </div>
  );
}

const styles = {
  segment: {
    position: 'relative' as const,
    display: 'grid' as const,
    width: '330px',
    padding: '3px',
    boxSizing: 'border-box' as const,
    borderRadius: '10px',
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--border)',
  },
  thumb: {
    position: 'absolute' as const,
    top: '3px',
    bottom: '3px',
    left: '3px',
    borderRadius: '7px',
    backgroundColor: 'var(--accent)',
  },
  segmentButton: {
    position: 'relative' as const,
    height: '31px',
    border: 0,
    background: 'none',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
    transition: 'color 0.2s ease',
  },
};
