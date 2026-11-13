import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { number } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

export function SharingFunnel({ range }: { range: StatsRange }) {
  const theme = getTheme();
  const steps = [
    { label: 'Share taps', value: range.shareTaps, hint: HINTS.shareTaps },
    { label: 'Links posted (approx.)', value: range.previews, hint: HINTS.previews },
    { label: 'Shared lineups opened', value: range.shareOpens, hint: HINTS.shareOpens },
    { label: 'New users from sharing', value: range.newFromShare, hint: HINTS.newFromShare },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Sharing</h2>
      <div style={statsStyles.list}>
        {steps.map((s) => (
          <div key={s.label} title={s.hint}>
            <div style={statsStyles.listRow}>
              <span style={{ ...statsStyles.hinted, color: theme.text.primary }}>{s.label}</span>
              <span style={{ ...statsStyles.listValue, color: theme.text.primary }}>{number(s.value)}</span>
            </div>
            <div style={{ ...statsStyles.track, backgroundColor: theme.bg.tertiary }}>
              <div style={{ ...statsStyles.fill, width: `${(s.value / max) * 100}%`, backgroundColor: theme.accent }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
