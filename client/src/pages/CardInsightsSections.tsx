import { Fragment, type ReactNode } from 'react';
import type { CardInsights, CardPatchPoint, CatalogCard } from '../api';
import { isClearChange, percent } from '../lib/cardStats';
import { ChangeTile, ChangeTileRow } from '../components/ChangeTiles';
import { ChangePill } from '../components/WinRateChange';
import type { Theme } from '../theme';

interface Props {
  card: CatalogCard;
  insights: CardInsights;
  catalog: CatalogCard[];
  theme: Theme;
  isMobile: boolean;
}

export default function CardInsightsSections({ card, insights, catalog, theme, isMobile }: Props) {
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
          <DeckStyles cardName={card.name} styleShares={insights.styles} cardWinRate={insights.winRate} theme={theme} isMobile={isMobile} />
        )}

      {partners.length > 0 && (
        <TileSection
          title={`${card.name} plays well with`}
          gap={gap}
          theme={theme}
          isMobile={isMobile}
          tiles={partners.map((p) => ({ card: byId.get(p.cardId)!, difference: p.lift, detail: `in ${percent(p.share, 0)} of games` }))}
        />
      )}

      {counters.length > 0 && (
        <TileSection
          title={`${card.name} struggles against`}
          gap={gap}
          theme={theme}
          isMobile={isMobile}
          tiles={counters.map((c) => ({ card: byId.get(c.cardId)!, difference: c.lift, detail: `${percent(c.winRate)} win rate` }))}
        />
      )}

      {insights.history.length >= 2 &&
        section(`${card.name} over the last patches`, <PatchHistory points={insights.history} theme={theme} isMobile={isMobile} />)}
    </>
  );
}

interface DeckStylesProps {
  cardName: string;
  styleShares: CardInsights['styles'];
  cardWinRate: number | null;
  theme: Theme;
  isMobile: boolean;
}

function DeckStyles({ cardName, styleShares, cardWinRate, theme, isMobile }: DeckStylesProps) {
  return (
    <>
      <div style={{ ...styles.styleGrid, gridTemplateColumns: isMobile ? 'minmax(0, 1fr) 78px' : 'minmax(0, 1fr) 116px', columnGap: isMobile ? '14px' : '28px' }}>
        <div style={{ ...styles.columnHead, color: theme.text.tertiary }}>Share of games</div>
        <div style={{ ...styles.columnHead, color: theme.text.tertiary, textAlign: 'right' }}>Win rate</div>
        {styleShares.map((style) => (
          <Fragment key={style.name}>
            <div>
              <div style={styles.styleHead}>
                <span style={{ color: theme.text.primary, fontWeight: 700 }}>{style.name}</span>
                <span style={{ color: theme.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{percent(style.share)}</span>
              </div>
              <div style={styles.track}>
                <span style={{ ...styles.fill, width: `${style.share * 100}%`, backgroundColor: style.winRate == null ? theme.text.tertiary : 'var(--accent)' }} />
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {style.winRate == null ? (
                <span style={{ color: theme.text.tertiary }}>–</span>
              ) : (
                <>
                  <span style={{ ...styles.styleWinRate, fontSize: isMobile ? '17px' : '20px', color: theme.text.primary }}>{percent(style.winRate)}</span>
                  {cardWinRate != null && <ChangePill change={style.winRate - cardWinRate} isClear={style.isClear} />}
                </>
              )}
            </div>
          </Fragment>
        ))}
      </div>
      {cardWinRate != null && (
        <p style={{ ...styles.footnote, color: theme.text.tertiary }}>
          Compared with {cardName}'s overall win rate of {percent(cardWinRate)}.
        </p>
      )}
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

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function patchLabel(point: CardPatchPoint): string {
  if (!point.until) return 'Now';
  return point.since ? shortDate(point.since) : `Before ${shortDate(point.until)}`;
}

function patchRange(point: CardPatchPoint): string {
  if (!point.since) return point.until ? `before ${shortDate(point.until)}` : 'earlier';
  return point.until ? `${shortDate(point.since)} – ${shortDate(point.until)}` : `since ${shortDate(point.since)}`;
}

function PatchHistory({ points, theme, isMobile }: { points: CardPatchPoint[]; theme: Theme; isMobile: boolean }) {
  const latest = points.at(-1)!;
  const previous = points.at(-2)!;
  const stat = (label: string, values: number[], isClear: boolean) => (
    <PatchStat label={label} values={values} points={points} isClear={isClear} theme={theme} isMobile={isMobile} />
  );
  return (
    <>
      <div style={{ ...styles.columns, gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))' }}>
        {stat('Win rate', points.map((p) => p.winRate), isClearChange(previous, latest))}
        {stat('Use rate', points.map((p) => p.playRate), false)}
      </div>
      <p style={{ ...styles.footnote, color: theme.text.tertiary }}>Changes are against the patch before, {patchRange(previous)}.</p>
    </>
  );
}

interface PatchStatProps {
  label: string;
  values: number[];
  points: CardPatchPoint[];
  isClear: boolean;
  theme: Theme;
  isMobile: boolean;
}

function PatchStat({ label, values, points, isClear, theme, isMobile }: PatchStatProps) {
  const latest = values.at(-1)!;
  const previous = values.at(-2)!;
  const last = points.length - 1;
  return (
    <div style={styles.patchStat}>
      <div style={{ ...styles.patchLabel, color: theme.text.secondary }}>{label} this patch</div>
      <div style={styles.patchValue}>
        <span style={{ ...styles.patchNumber, fontSize: isMobile ? '30px' : '34px', color: theme.text.primary }}>{percent(latest)}</span>
        <ChangePill change={latest - previous} isClear={isClear} large />
      </div>
      <Sparkline label={label} values={values} points={points} theme={theme} />
      <div style={styles.ticks}>
        {points.map((p, i) => (
          <div key={p.since ?? 'earlier'} style={{ textAlign: i === 0 ? 'left' : i === last ? 'right' : 'center' }}>
            <div style={{ color: i === last ? theme.text.primary : theme.text.secondary, fontWeight: i === last ? 700 : 500 }}>{patchLabel(p)}</div>
            <div style={{ color: theme.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{p.games.toLocaleString('en-US')} games</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SPARK_WIDTH = 300;
const SPARK_HEIGHT = 56;

function Sparkline({ label, values, points, theme }: { label: string; values: number[]; points: CardPatchPoint[]; theme: Theme }) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min || 1;
  const step = SPARK_WIDTH / (values.length - 1);
  const coords = values.map((v, i) => [i * step, SPARK_HEIGHT - 6 - ((v - min) / range) * (SPARK_HEIGHT - 14)] as const);
  const line = coords.map(([x, y]) => `${x},${y}`).join(' ');
  const description = values.map((v, i) => `${patchLabel(points[i]!)} ${percent(v)}`).join(', ');
  return (
    <svg viewBox={`-6 -2 ${SPARK_WIDTH + 12} ${SPARK_HEIGHT + 4}`} style={styles.spark} role="img" aria-label={`${label} per patch: ${description}`}>
      <polygon points={`0,${SPARK_HEIGHT} ${line} ${SPARK_WIDTH},${SPARK_HEIGHT}`} fill="var(--accent)" opacity="0.1" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {coords.map(([x, y], i) => {
        const isLatest = i === coords.length - 1;
        return (
          <circle key={i} cx={x} cy={y} r={isLatest ? 4 : 3} fill={isLatest ? 'var(--accent)' : theme.bg.tertiary} stroke="var(--accent)" strokeWidth="2" />
        );
      })}
    </svg>
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
  styleGrid: {
    display: 'grid' as const,
    rowGap: '14px',
    alignItems: 'center' as const,
    fontSize: '14px',
  },
  columnHead: {
    fontSize: '12px',
  },
  styleHead: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '10px',
    marginBottom: '6px',
  },
  styleWinRate: {
    display: 'block' as const,
    fontWeight: 800,
    lineHeight: 1.1,
    marginBottom: '3px',
    fontVariantNumeric: 'tabular-nums',
  },
  footnote: {
    margin: '14px 0 0',
    fontSize: '12.5px',
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
    gap: '14px',
  },
  patchStat: {
    minWidth: 0,
    padding: '16px 16px 12px',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-tertiary)',
  },
  patchLabel: {
    fontSize: '12.5px',
  },
  patchValue: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    margin: '4px 0 10px',
  },
  patchNumber: {
    fontFamily: "'Lilita One', system-ui, -apple-system, sans-serif",
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  spark: {
    display: 'block' as const,
    width: '100%',
    height: 'auto',
    overflow: 'visible' as const,
  },
  ticks: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '8px',
    marginTop: '6px',
    fontSize: '11px',
    lineHeight: 1.35,
  },
};
