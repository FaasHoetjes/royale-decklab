import type { ReactNode } from 'react';
import type { CardInsights, CardPatchPoint, CatalogCard } from '../api';
import { percent } from '../lib/cardStats';
import { ChangeTile, ChangeTileRow } from '../components/ChangeTiles';
import type { Theme } from '../theme';

interface Props {
  card: CatalogCard;
  insights: CardInsights;
  cardWinRate: number | undefined;
  catalog: CatalogCard[];
  theme: Theme;
  isMobile: boolean;
}

export default function CardInsightsSections({ card, insights, cardWinRate, catalog, theme, isMobile }: Props) {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const partners = insights.partners.filter((p) => byId.has(p.cardId));
  const counters = insights.counters.filter((c) => byId.has(c.cardId));
  const gap = isMobile ? '22px' : '30px';

  const section = (title: string, children: ReactNode) => (
    <section style={{ marginTop: gap }}>
      <h2 style={{ ...styles.title, color: theme.text.primary }}>{title}</h2>
      <div style={styles.panel}>{children}</div>
    </section>
  );

  return (
    <>
      {insights.summary.length > 0 &&
        section(
          `${card.name} in Clan War`,
          insights.summary.map((paragraph) => (
            <p key={paragraph} style={{ ...styles.paragraph, color: theme.text.primary }}>{paragraph}</p>
          ))
        )}

      {insights.styles.length > 0 &&
        section(
          `Deck styles with ${card.name}`,
          <ul style={styles.list}>
            {insights.styles.map((style) => (
              <li key={style.name} style={styles.styleRow}>
                <div style={styles.styleHead}>
                  <span style={{ color: theme.text.primary, fontWeight: 700 }}>{style.name}</span>
                  <span style={{ color: theme.text.secondary }}>
                    {percent(style.share)} of games{style.winRate != null && `, ${percent(style.winRate)} win rate`}
                  </span>
                </div>
                <div style={styles.track}>
                  <span style={{ ...styles.fill, width: `${style.share * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}

      {partners.length > 0 && cardWinRate != null && (
        <TileSection
          title={`${card.name} plays well with`}
          gap={gap}
          theme={theme}
          isMobile={isMobile}
          tiles={partners.map((p) => ({ card: byId.get(p.cardId)!, difference: p.winRate - cardWinRate, detail: `in ${percent(p.share, 0)} of games` }))}
        />
      )}

      {counters.length > 0 && insights.matchupWinRate != null && (
        <TileSection
          title={`${card.name} struggles against`}
          gap={gap}
          theme={theme}
          isMobile={isMobile}
          tiles={counters.map((c) => ({ card: byId.get(c.cardId)!, difference: c.winRate - insights.matchupWinRate!, detail: `${percent(c.winRate)} win rate` }))}
        />
      )}

      {insights.history.length >= 2 &&
        section(`${card.name} over the last patches`, <PatchHistory points={insights.history} theme={theme} isMobile={isMobile} />)}
    </>
  );
}

interface Tile {
  card: CatalogCard;
  difference: number;
  detail: string;
}

function TileSection({ title, tiles, gap, theme, isMobile }: { title: string; tiles: Tile[]; gap: string; theme: Theme; isMobile: boolean }) {
  return (
    <section style={{ marginTop: gap }}>
      <h2 style={{ ...styles.title, color: theme.text.primary }}>{title}</h2>
      <div style={{ ...styles.panel, padding: isMobile ? '2px 14px' : '4px 20px' }}>
        <ChangeTileRow isMobile={isMobile}>
          {tiles.map(({ card, difference, detail }) => (
            <ChangeTile key={card.id} card={card} change={difference} detail={detail} isMobile={isMobile} />
          ))}
        </ChangeTileRow>
      </div>
    </section>
  );
}

const sinceLabel = (since: string | null) =>
  since ? `From ${new Date(since).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}` : 'Earlier';

function PatchHistory({ points, theme, isMobile }: { points: CardPatchPoint[]; theme: Theme; isMobile: boolean }) {
  return (
    <>
      <div style={{ ...styles.columns, gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' }}>
        <Sparkline label="Win rate" values={points.map((p) => p.winRate)} theme={theme} />
        <Sparkline label="Use rate" values={points.map((p) => p.playRate)} theme={theme} />
      </div>
      <ul style={{ ...styles.list, marginTop: '14px' }}>
        {points.map((p) => (
          <li key={p.since ?? 'earlier'} style={{ color: theme.text.secondary, fontSize: '13px' }}>
            <span style={{ color: theme.text.primary, fontWeight: 600 }}>{sinceLabel(p.since)}</span>: {percent(p.winRate)} win rate,{' '}
            {percent(p.playRate)} use rate
          </li>
        ))}
      </ul>
    </>
  );
}

const SPARK_WIDTH = 240;
const SPARK_HEIGHT = 48;

function Sparkline({ label, values, theme }: { label: string; values: number[]; theme: Theme }) {
  const latest = values.at(-1) ?? 0;
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = SPARK_WIDTH / (values.length - 1);
  const coords = values.map((v, i) => [i * step, SPARK_HEIGHT - 4 - ((v - min) / range) * (SPARK_HEIGHT - 8)] as const);
  const [lastX, lastY] = coords.at(-1) ?? [0, 0];
  return (
    <div>
      <div style={{ ...styles.sparkHead, color: theme.text.secondary }}>
        {label} <b style={{ color: theme.text.primary }}>{percent(latest)}</b>
      </div>
      <svg viewBox={`-4 0 ${SPARK_WIDTH + 8} ${SPARK_HEIGHT}`} style={styles.spark} role="img" aria-label={`${label} per patch: ${values.map((v) => percent(v)).join(', ')}`}>
        <polyline points={coords.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={lastX} cy={lastY} r="3.5" fill="var(--accent)" />
      </svg>
    </div>
  );
}

const styles = {
  title: {
    margin: '0 0 14px',
    fontSize: '20px',
  },
  panel: {
    padding: '18px 20px',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
  },
  paragraph: {
    margin: '0 0 10px',
    fontSize: '14.5px',
    lineHeight: 1.6,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
  },
  styleRow: {
    fontSize: '14px',
  },
  styleHead: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    gap: '4px 12px',
    marginBottom: '6px',
  },
  track: {
    height: '8px',
    borderRadius: '999px',
    backgroundColor: 'var(--bg-tertiary)',
    overflow: 'hidden' as const,
  },
  fill: {
    display: 'block' as const,
    height: '100%',
    borderRadius: '999px',
    backgroundColor: 'var(--accent)',
  },
  columns: {
    display: 'grid' as const,
    gap: '20px',
  },
  sparkHead: {
    fontSize: '13px',
    marginBottom: '6px',
  },
  spark: {
    display: 'block' as const,
    width: '100%',
    height: '48px',
  },
};
