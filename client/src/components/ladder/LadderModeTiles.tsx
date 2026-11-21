import type { ReactNode } from 'react';
import type { LadderModeId } from '../../api';

interface LadderModeTilesProps {
  value: LadderModeId;
  onPick: (mode: LadderModeId) => void;
  /** Under each mode's name, e.g. the player's trophies. */
  detail: Record<LadderModeId, string | undefined>;
}

const MODES: Array<{ id: LadderModeId; name: string; icon: ReactNode }> = [
  {
    id: 'trophy-road',
    name: 'Trophy Road',
    icon: (
      <>
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16" />
        <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
      </>
    ),
  },
  {
    id: 'ranked',
    name: 'Ranked',
    icon: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
];

export default function LadderModeTiles({ value, onPick, detail }: LadderModeTilesProps) {
  return (
    <div role="radiogroup" aria-label="Mode" style={styles.group}>
      {MODES.map((mode) => {
        const on = mode.id === value;
        return (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(mode.id)}
            style={{ ...styles.tile, ...(on ? styles.tileOn : {}) }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
              {mode.icon}
            </svg>
            <span style={{ minWidth: 0 }}>
              <b style={styles.name}>{mode.name}</b>
              {detail[mode.id] && <span style={styles.detail}>{detail[mode.id]}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const styles = {
  group: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
  },
  tile: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    padding: '12px 14px',
    borderRadius: '14px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--panel-border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    font: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, box-shadow 0.2s ease, color 0.2s ease',
  },
  tileOn: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 1px var(--accent), 0 8px 24px var(--accent-a20)',
    color: 'var(--accent)',
  },
  name: {
    display: 'block',
    fontSize: '15px',
    color: 'var(--text-primary)',
  },
  detail: {
    display: 'block',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
};
