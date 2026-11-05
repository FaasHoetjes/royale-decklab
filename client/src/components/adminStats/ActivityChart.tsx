import type { StatsPoint } from '../../api';
import { getTheme } from '../../theme';
import { number } from './format';

const BAR_SLOT = 10;
const BAR_WIDTH = 8;
const VISITORS_OPACITY = 0.3;
const IN_PROGRESS_OPACITY = 0.45;

type ActivityChartProps = {
  points: StatsPoint[];
  previous: StatsPoint[] | null;
  keyLabel: (key: string) => string;
};

const describe = (point: StatsPoint, inProgress: boolean, before: StatsPoint | undefined, keyLabel: (key: string) => string) => {
  const soFar = inProgress ? ' (so far)' : '';
  const previous = before ? `, ${number(before.visitors)} visitors the period before` : '';
  return `${keyLabel(point.key)}${soFar}: ${number(point.visitors)} visitors, ${number(point.users)} real users${previous}`;
};

/** Visitors behind real users per bar; the last bar is the day or hour still going on. */
export function ActivityChart({ points, previous, keyLabel }: ActivityChartProps) {
  const theme = getTheme();
  const max = Math.max(1, ...points.map((p) => p.visitors), ...(previous ?? []).map((p) => p.visitors));
  const y = (value: number) => 100 - (value / max) * 100;
  const last = points.length - 1;
  const first = points[0];
  const final = points[last];
  return (
    <div>
      <svg viewBox={`0 0 ${points.length * BAR_SLOT} 100`} preserveAspectRatio="none" width="100%" height="160" role="img" aria-label="Visitors and real users per period" style={styles.chart}>
        {points.map((p, i) => (
          <g key={p.key} opacity={i === last ? IN_PROGRESS_OPACITY : 1}>
            <title>{describe(p, i === last, previous?.[i], keyLabel)}</title>
            <rect x={i * BAR_SLOT + 1} y={y(p.visitors)} width={BAR_WIDTH} height={100 - y(p.visitors)} fill="var(--accent)" fillOpacity={VISITORS_OPACITY} />
            <rect x={i * BAR_SLOT + 1} y={y(p.users)} width={BAR_WIDTH} height={100 - y(p.users)} fill="var(--accent)" />
          </g>
        ))}
        {previous && previous.length > 1 && (
          <polyline
            points={previous.map((p, i) => `${i * BAR_SLOT + BAR_SLOT / 2},${y(p.visitors)}`).join(' ')}
            fill="none"
            stroke="var(--text-secondary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div style={{ ...styles.axis, color: theme.text.tertiary }}>
        <span>{first && keyLabel(first.key)}</span>
        <span>max {number(max)}</span>
        <span>{final && keyLabel(final.key)}</span>
      </div>
      <div style={{ ...styles.legend, color: theme.text.secondary }}>
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent, opacity: VISITORS_OPACITY }} />Visitors</span>
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent }} />Real users</span>
        {previous && <span style={styles.legendItem}><span style={{ ...styles.dash, borderColor: theme.text.secondary }} />Visitors, period before</span>}
        <span style={styles.legendItem}><span style={{ ...styles.swatch, backgroundColor: theme.accent, opacity: IN_PROGRESS_OPACITY }} />Faded: still in progress</span>
      </div>
    </div>
  );
}

const styles = {
  chart: {
    display: 'block' as const,
  },
  axis: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    fontSize: '12px',
    marginTop: '6px',
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '6px 16px',
    fontSize: '12px',
    marginTop: '10px',
  },
  legendItem: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
  },
  swatch: {
    width: '10px',
    height: '10px',
    borderRadius: '2px',
  },
  dash: {
    width: '14px',
    borderTop: '2px dashed',
  },
};
