import type { StatsMonth } from '../../api';
import { getTheme } from '../../theme';
import { duration, number } from './format';
import { statsStyles } from './styles';

const COLUMNS: { label: string; value: (m: StatsMonth) => string }[] = [
  { label: 'Visitors', value: (m) => number(m.visitors) },
  { label: 'Users', value: (m) => number(m.users) },
  { label: 'Lookups', value: (m) => number(m.lookups) },
  { label: 'Players', value: (m) => number(m.players) },
  { label: 'Deck links copied', value: (m) => number(m.deckCopies) },
  { label: 'Open-in-game clicks', value: (m) => number(m.deckOpens) },
  { label: 'People exporting', value: (m) => number(m.deckExporters) },
  { label: 'Shares opened', value: (m) => number(m.shareOpens) },
  { label: 'New from sharing', value: (m) => number(m.newFromShare) },
  { label: 'Time on site', value: (m) => (m.timeMedian === null ? '–' : duration(m.timeMedian)) },
];

export function MonthsTable({ months }: { months: StatsMonth[] }) {
  const theme = getTheme();
  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Months</h2>
      <div style={styles.wrap}>
        <table style={styles.table}>
          <thead>
            <tr style={{ color: theme.text.tertiary }}>
              <th style={styles.th}>Month</th>
              {COLUMNS.map((c) => <th key={c.label} style={styles.thNumber}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} style={{ color: theme.text.primary, borderTop: `1px solid ${theme.border}` }}>
                <td style={styles.td}>
                  {m.month}
                  {m.partial && <span style={{ color: theme.text.tertiary }}> (so far)</span>}
                </td>
                {COLUMNS.map((c) => <td key={c.label} style={styles.tdNumber}>{c.value(m)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const styles = {
  wrap: {
    overflowX: 'auto' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  th: {
    textAlign: 'left' as const,
    fontWeight: 600 as const,
    padding: '6px 8px',
    whiteSpace: 'nowrap' as const,
  },
  thNumber: {
    textAlign: 'right' as const,
    fontWeight: 600 as const,
    padding: '6px 8px',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '8px',
    whiteSpace: 'nowrap' as const,
  },
  tdNumber: {
    padding: '8px',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
