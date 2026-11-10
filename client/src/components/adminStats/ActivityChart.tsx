import { useState } from 'react';
import type { StatsPoint } from '../../api';
import { getTheme } from '../../theme';
import { number } from './format';

const BAR_SLOT = 10;
const BAR_WIDTH = 8;
const VISITORS_OPACITY = 0.3;
const IN_PROGRESS_OPACITY = 0.45;
const HOVER_OPACITY = 0.08;
const EDGE_SHARE = 0.15;

type ActivityChartProps = {
  points: StatsPoint[];
  previous: StatsPoint[] | null;
  keyLabel: (key: string) => string;
};

/** Keeps the tooltip inside the chart: anchored by its left or right edge near the sides, centred elsewhere. */
const tooltipShift = (share: number) => {
  if (share < EDGE_SHARE) return 'translateX(-10%)';
  if (share > 1 - EDGE_SHARE) return 'translateX(-90%)';
  return 'translateX(-50%)';
};

/** Visitors behind real users per bar; the last bar is the day or hour still going on. */
export function ActivityChart({ points, previous, keyLabel }: ActivityChartProps) {
  const theme = getTheme();
  const max = Math.max(1, ...points.map((p) => p.visitors), ...(previous ?? []).map((p) => p.visitors));
  const y = (value: number) => 100 - (value / max) * 100;
  const last = points.length - 1;
  const first = points[0];
  const final = points[last];
  const [hovered, setHovered] = useState<number | null>(null);
  const point = hovered == null ? undefined : points[hovered];
  const before = hovered == null ? undefined : previous?.[hovered];
  const share = hovered == null ? 0 : (hovered + 0.5) / points.length;
  return (
    <div>
      <div style={styles.plot} onPointerLeave={() => setHovered(null)}>
        <svg viewBox={`0 0 ${points.length * BAR_SLOT} 100`} preserveAspectRatio="none" width="100%" height="160" role="img" aria-label="Visitors and real users per period" style={styles.chart}>
          {points.map((p, i) => (
            <g key={p.key} opacity={i === last ? IN_PROGRESS_OPACITY : 1}>
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
          {points.map((p, i) => (
            <rect
              key={p.key}
              x={i * BAR_SLOT}
              y={0}
              width={BAR_SLOT}
              height={100}
              fill="var(--text-primary)"
              fillOpacity={i === hovered ? HOVER_OPACITY : 0}
              onPointerEnter={() => setHovered(p.visitors > 0 ? i : null)}
              style={p.visitors > 0 ? styles.hit : undefined}
            />
          ))}
        </svg>
        {point && (
          <div style={{ ...styles.tooltip, left: `${share * 100}%`, transform: tooltipShift(share) }}>
            <strong style={styles.tooltipTitle}>
              {keyLabel(point.key)}
              {hovered === last && ' (so far)'}
            </strong>
            <span>{`${number(point.visitors)} visitors`}</span>
            <span>{`${number(point.users)} real users`}</span>
            {before && <span style={styles.tooltipMuted}>{`${number(before.visitors)} visitors the period before`}</span>}
          </div>
        )}
      </div>
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
  plot: {
    position: 'relative' as const,
  },
  chart: {
    display: 'block' as const,
  },
  hit: {
    cursor: 'pointer',
  },
  tooltip: {
    position: 'absolute' as const,
    top: '4px',
    display: 'grid' as const,
    gap: '2px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid var(--panel-border)',
    backgroundColor: 'var(--bg-secondary)',
    boxShadow: 'var(--panel-shadow)',
    color: 'var(--text-primary)',
    fontSize: '12.5px',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
  },
  tooltipTitle: {
    fontSize: '13px',
  },
  tooltipMuted: {
    color: 'var(--text-secondary)',
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
