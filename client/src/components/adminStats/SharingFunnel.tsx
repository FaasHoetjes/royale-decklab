import type { StatsRange } from '../../api';
import { getTheme } from '../../theme';
import { number } from './format';
import { statsStyles } from './styles';

export function SharingFunnel({ range }: { range: StatsRange }) {
  const theme = getTheme();
  const steps = [
    { label: 'Share taps', value: range.shareTaps },
    { label: 'Links posted (approx.)', value: range.previews, hint: 'Link previews fetched by Discord, WhatsApp and the like' },
    { label: 'Shared decks opened', value: range.shareOpens },
    { label: 'New users from sharing', value: range.newFromShare, hint: 'Opened a shared lineup, then looked up a different player within 7 days' },
  ];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Sharing</h2>
      <div style={statsStyles.list}>
        {steps.map((s) => (
          <div key={s.label} title={s.hint}>
            <div style={statsStyles.listRow}>
              <span style={{ color: theme.text.primary }}>{s.label}</span>
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
