import type { StatsMonth } from '../../api';
import { getTheme } from '../../theme';
import { number } from './format';
import { statsStyles } from './styles';

const COLUMNS: { label: string; value: (m: StatsMonth) => number }[] = [
  { label: 'Visitors', value: (m) => m.visitors },
  { label: 'Users', value: (m) => m.users },
  { label: 'Lookups', value: (m) => m.lookups },
  { label: 'Players', value: (m) => m.players },
  { label: 'Shares opened', value: (m) => m.shareOpens },
  { label: 'New from sharing', value: (m) => m.newFromShare },
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
                {COLUMNS.map((c) => <td key={c.label} style={styles.tdNumber}>{number(c.value(m))}</td>)}
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
