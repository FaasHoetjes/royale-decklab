import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { number, percent, toolLabel } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

export function DeckExports({ range }: { range: StatsRange }) {
  const theme = getTheme();
  const exports = range.deckExports;
  const metrics = [
    { label: 'Deck links copied', hint: HINTS.deckCopies, value: number(exports.copies) },
    { label: 'Open-in-game clicks', hint: HINTS.deckOpens, value: number(exports.opens) },
    { label: 'Visitors exporting', hint: HINTS.exporters, value: number(exports.visitors) },
    { label: 'Export rate', hint: HINTS.exportRate, value: percent(exports.visitors, range.visitors) },
  ];

  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Deck exports</h2>
      <div style={styles.metrics}>
        {metrics.map((metric) => (
          <div key={metric.label} title={metric.hint}>
            <div style={{ fontSize: '13px', ...statsStyles.hinted, color: theme.text.secondary }}>{metric.label}</div>
            <div style={{ ...styles.value, color: theme.text.primary }}>{metric.value}</div>
          </div>
        ))}
      </div>
      {exports.tools.length > 0 && (
        <div style={{ overflowX: 'auto', marginTop: '16px' }}>
          <table style={styles.table}>
            <thead>
              <tr style={{ color: theme.text.tertiary }}>
                <th scope="col" style={styles.cell}>Page</th>
                <th scope="col" style={styles.numericCell} title={HINTS.deckCopies}>Copies</th>
                <th scope="col" style={styles.numericCell} title={HINTS.deckOpens}>Opens</th>
                <th scope="col" style={styles.numericCell} title={HINTS.exporters}>Visitors</th>
              </tr>
            </thead>
            <tbody>
              {exports.tools.map((tool) => (
                <tr key={tool.key} style={{ color: theme.text.primary, borderTop: `1px solid ${theme.border}` }}>
                  <th scope="row" style={{ ...styles.cell, fontWeight: 500 }}>{toolLabel(tool.key)}</th>
                  <td style={styles.numericCell}>{number(tool.copies)}</td>
                  <td style={styles.numericCell}>{number(tool.opens)}</td>
                  <td style={styles.numericCell}>{number(tool.visitors)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ ...statsStyles.note, marginTop: '12px', lineHeight: 1.5, color: theme.text.tertiary }}>
        Every successful copy and open click counts. People are anonymous estimates across both actions.
        Open clicks show intent; they do not confirm a deck was imported.
      </p>
    </section>
  );
}

const styles = {
  metrics: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '12px',
  },
  value: {
    fontSize: '26px',
    fontWeight: 800,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '14px',
  },
  cell: { padding: '8px 0', textAlign: 'left' as const },
  numericCell: {
    padding: '8px',
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
