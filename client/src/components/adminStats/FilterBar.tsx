import type { StatsFilters } from '../../api';
import { getTheme } from '../../theme';
import { FILTER_LABELS, FILTER_NAMES } from './format';
import { statsStyles } from './styles';

type FilterBarProps = {
  filters: [keyof StatsFilters, string][];
  onRemove: (name: keyof StatsFilters, key: string) => void;
  onClear: () => void;
};

export function FilterBar({ filters, onRemove, onClear }: FilterBarProps) {
  const theme = getTheme();
  return (
    <div style={styles.bar}>
      {filters.map(([name, key]) => {
        const text = `${FILTER_NAMES[name]}: ${FILTER_LABELS[name](key)}`;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onRemove(name, key)}
            aria-label={`Remove filter ${text}`}
            style={{ ...styles.chip, backgroundColor: theme.accent, color: theme.onAccent }}
          >
            {text} ✕
          </button>
        );
      })}
      <button type="button" onClick={onClear} style={{ ...statsStyles.link, alignSelf: 'center', color: theme.accent }}>
        Clear filters
      </button>
      <span style={{ ...statsStyles.note, color: theme.text.tertiary }}>Only visitors who match, within the period. The months table isn't filtered.</span>
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    flexWrap: 'wrap' as const,
  },
  chip: {
    padding: '6px 12px',
    borderRadius: '999px',
    border: 'none',
    fontWeight: 600 as const,
    fontSize: '13px',
    cursor: 'pointer',
  },
};
