import type { Theme } from '../theme';
import { FILTER_OPTIONS, type FilterKey } from '../lib/pickerData';

interface FilterPopoverProps {
  filters: Set<FilterKey>;
  onToggle: (key: FilterKey) => void;
  onClear: () => void;
  onClose: () => void;
  theme: Theme;
}

export default function FilterPopover({ filters, onToggle, onClear, onClose, theme }: FilterPopoverProps) {
  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <div style={{ ...styles.popover, backgroundColor: theme.bg.secondary, border: `1px solid ${theme.border}` }}>
        {FILTER_OPTIONS.map((opt) => {
          const on = filters.has(opt.key);
          return (
            <button
              className="picker-filter-option mobile-touch-target"
              key={opt.key}
              onClick={() => onToggle(opt.key)}
              style={{ ...styles.option, color: theme.text.primary }}
              role="menuitemcheckbox"
              aria-checked={on}
            >
              <span
                style={{
                  ...styles.check,
                  backgroundColor: on ? theme.accent : 'transparent',
                  border: `2px solid ${on ? theme.accent : theme.borderStrong}`,
                  color: theme.onAccent,
                }}
              >
                {on && (
                  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13 L10 18 L19 6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          );
        })}
        <button
          className="mobile-touch-target"
          onClick={onClear}
          disabled={filters.size === 0}
          style={{
            ...styles.clear,
            borderTop: `1px solid ${theme.border}`,
            color: filters.size ? theme.accent : theme.text.tertiary,
          }}
        >
          Clear
        </button>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 10,
  },
  popover: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    right: 0,
    zIndex: 11,
    minWidth: '200px',
    borderRadius: '10px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
    padding: '6px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  option: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    width: '100%',
    padding: '9px 10px',
    background: 'none',
    border: 'none',
    borderRadius: '7px',
    fontSize: '14px',
    fontWeight: 600 as const,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  check: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '20px',
    height: '20px',
    flexShrink: 0,
    borderRadius: '6px',
  },
  clear: {
    marginTop: '4px',
    padding: '10px',
    background: 'none',
    border: 'none',
    borderRadius: 0,
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
};
