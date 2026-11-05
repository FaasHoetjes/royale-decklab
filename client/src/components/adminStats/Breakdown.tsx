import { useState } from 'react';
import type { StatsCount } from '../../api';
import { getTheme } from '../../theme';
import { duration, number, percent } from './format';
import { statsStyles } from './styles';

const ROWS_SHOWN = 8;

type BreakdownProps = {
  title: string;
  counts: StatsCount[];
  /** Without a total, the counts aren't shares of the users above (tools count every visitor), so bars scale to the largest. */
  total?: number;
  label: (key: string) => string;
  lookedUp?: Map<string, number>;
  /** Median seconds in view per key, left out for keys with too few measured visitors. */
  times?: Map<string, number>;
  selected?: string;
  onSelect?: (key: string) => void;
  extra?: { title: string; counts: StatsCount[] };
};

export function Breakdown({ title, counts, total, label, lookedUp, times, selected, onSelect, extra }: BreakdownProps) {
  const theme = getTheme();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? counts : counts.slice(0, ROWS_SHOWN);
  const scale = total ?? Math.max(1, ...counts.map((c) => c.users));

  const row = (c: StatsCount) => {
    const time = times?.get(c.key);
    const value = total === undefined ? number(c.users) : `${number(c.users)} · ${percent(c.users, total)}`;
    const width = scale > 0 ? Math.min(100, (c.users / scale) * 100) : 0;
    return (
      <>
        <div style={statsStyles.listRow}>
          <span style={{ color: theme.text.primary, fontWeight: selected === c.key ? 700 : 400 }}>
            {label(c.key)}
            {lookedUp && c.users > 0 && (
              <span style={{ ...styles.lookedUp, color: theme.text.tertiary }}> · {percent(lookedUp.get(c.key) ?? 0, c.users)} looked up</span>
            )}
            {time !== undefined && <span style={{ ...styles.lookedUp, color: theme.text.tertiary }}> · {duration(time)}</span>}
          </span>
          <span style={{ ...statsStyles.listValue, color: theme.text.secondary }}>{value}</span>
        </div>
        <div style={{ ...statsStyles.track, backgroundColor: theme.bg.tertiary }}>
          <div style={{ ...statsStyles.fill, width: `${width}%`, backgroundColor: theme.accent }} />
        </div>
      </>
    );
  };

  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>{title}</h2>
      {counts.length === 0 && <p style={{ ...statsStyles.note, color: theme.text.tertiary }}>Nothing yet.</p>}
      {counts.length > 0 && (
        <div style={statsStyles.list}>
          {shown.map((c) => {
            if (!onSelect) return <div key={c.key}>{row(c)}</div>;
            const active = selected === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onSelect(c.key)}
                aria-pressed={active}
                title={active ? 'Remove this filter' : 'Show only these visitors'}
                style={styles.rowButton}
              >
                {row(c)}
              </button>
            );
          })}
          {counts.length > ROWS_SHOWN && (
            <button type="button" onClick={() => setExpanded(!expanded)} style={{ ...statsStyles.link, color: theme.accent }}>
              {expanded ? 'Show fewer' : `Show all ${counts.length}`}
            </button>
          )}
        </div>
      )}
      {extra && (
        <>
          <h3 style={{ ...styles.subheading, color: theme.text.secondary }}>{extra.title}</h3>
          <div style={statsStyles.list}>
            {extra.counts.slice(0, ROWS_SHOWN).map((c) => (
              <div key={c.key} style={statsStyles.listRow}>
                <span style={{ color: theme.text.primary }}>{c.key}</span>
                <span style={{ ...statsStyles.listValue, color: theme.text.secondary }}>{number(c.users)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

const styles = {
  rowButton: {
    display: 'block' as const,
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    font: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  lookedUp: {
    fontSize: '12px',
  },
  subheading: {
    margin: '16px 0 8px',
    fontSize: '13px',
  },
};
