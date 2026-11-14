import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { number, percent } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

/** How many visitors reach the start page's patch section, and how many get there by its button. */
export function PatchSection({ range }: { range: StatsRange }) {
  const theme = getTheme();
  const rows = [
    { label: 'Saw the patch section', value: range.patchSeen, hint: HINTS.patchSeen },
    { label: 'Pressed the patch button', value: range.patchOpeners, hint: HINTS.patchOpeners },
  ];
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Patch section</h2>
      <div style={statsStyles.list}>
        {rows.map((r) => (
          <div key={r.label} title={r.hint}>
            <div style={statsStyles.listRow}>
              <span style={{ ...statsStyles.hinted, color: theme.text.primary }}>{r.label}</span>
              <span style={{ ...statsStyles.listValue, color: theme.text.primary }}>
                {number(r.value)}
                {range.visitors > 0 && <span style={{ color: theme.text.tertiary }}> · {percent(r.value, range.visitors)} of visitors</span>}
              </span>
            </div>
            <div style={{ ...statsStyles.track, backgroundColor: theme.bg.tertiary }}>
              <div style={{ ...statsStyles.fill, width: `${(r.value / max) * 100}%`, backgroundColor: theme.accent }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
