import type { StatsMonth } from '../../api';
import { getTheme } from '../../theme';
import { duration, number } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

const COLUMNS: { label: string; hint: string; value: (m: StatsMonth) => string }[] = [
  { label: 'Visitors', hint: HINTS.visitors, value: (m) => number(m.visitors) },
  { label: 'Pageviews', hint: HINTS.pageviews, value: (m) => (m.pageviews === null ? '–' : number(m.pageviews)) },
  { label: 'Active users', hint: HINTS.activeUsers, value: (m) => number(m.users) },
  { label: 'Lookups', hint: HINTS.lookups, value: (m) => number(m.lookups) },
  { label: 'Unique players', hint: HINTS.uniquePlayers, value: (m) => number(m.players) },
  { label: 'Deck links copied', hint: HINTS.deckCopies, value: (m) => number(m.deckCopies) },
  { label: 'Open-in-game clicks', hint: HINTS.deckOpens, value: (m) => number(m.deckOpens) },
  { label: 'Visitors exporting', hint: HINTS.exporters, value: (m) => number(m.deckExporters) },
  { label: 'Shared lineups opened', hint: HINTS.shareOpens, value: (m) => number(m.shareOpens) },
  { label: 'New from sharing', hint: HINTS.newFromShare, value: (m) => number(m.newFromShare) },
  { label: 'Time on site', hint: HINTS.timeOnSite, value: (m) => (m.timeMedian === null ? '–' : duration(m.timeMedian)) },
];

export function MonthsTable({ months }: { months: StatsMonth[] }) {
  const theme = getTheme();
  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Months</h2>
      <div style={statsStyles.tableWrap}>
        <table style={statsStyles.table}>
          <thead>
            <tr style={{ color: theme.text.tertiary }}>
              <th style={statsStyles.th}>Month</th>
              {COLUMNS.map((c) => (
                <th key={c.label} title={c.hint} style={statsStyles.thNumber}>
                  <span style={statsStyles.hinted}>{c.label}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} style={{ color: theme.text.primary, borderTop: `1px solid ${theme.border}` }}>
                <td style={statsStyles.td}>
                  {m.month}
                  {m.partial && <span style={{ color: theme.text.tertiary }}> (so far)</span>}
                </td>
                {COLUMNS.map((c) => <td key={c.label} style={statsStyles.tdNumber}>{c.value(m)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
