import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getTheme } from '../theme';
import { useAllCards, useCardStats, usePatch } from '../queries';
import type { BalanceChange, BalanceChangeKind, BalanceUpdate, CardStat, CardStatsResponse, CatalogCard } from '../api';
import type { CardVersion } from '../lib/cardDisplay';
import { useIsMobile } from '../hooks/useIsMobile';
import { cardIconUrl } from '../lib/cardDisplay';
import { mostPlayedVersion } from '../lib/cardInfo';
import { percent } from '../lib/cardStats';
import { patchName, playRateMovers, updateDate, winRateMovers, type Mover } from '../lib/patchMovers';
import { track } from '../lib/stats';
import CardTile from './CardTile';
import CardLink from './CardLink';
import LoadError from './LoadError';
import { ChangePill } from './WinRateChange';

const SKELETON_TILES = 10;

const KIND_LABEL: Record<BalanceChangeKind, string> = { buff: 'Buff', nerf: 'Nerf', rework: 'Rework' };
const KIND_COLOR: Record<BalanceChangeKind, string> = { buff: 'var(--up)', nerf: 'var(--down)', rework: 'var(--text-secondary)' };
const VERSION_PREFIX: Record<CardVersion, string> = { normal: '', evo: 'Evo ', hero: 'Hero ' };

// Most of the banner on screen counts as having seen the section, which on a phone is far taller than the screen.
const SEEN_SHARE = 0.6;

/** The start page's patch section: this patch's balance changes and the cards that moved the most. */
export default function PatchOverview() {
  const theme = getTheme();
  const isMobile = useIsMobile();
  const catalog = useAllCards();
  const statsQuery = useCardStats();
  const patch = usePatch();
  const bannerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!banner || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        track({ kind: 'patch_seen' });
        observer.disconnect();
      },
      { threshold: SEEN_SHARE }
    );
    observer.observe(banner);
    return () => observer.disconnect();
  }, []);

  const stats = statsQuery.data;
  const cardById = new Map((catalog.data ?? []).map((card) => [card.id, card]));
  const statById = new Map((stats?.cards ?? []).map((stat) => [stat.id, stat]));
  const updates = patch.data?.updates ?? [];

  const failed = catalog.isError || statsQuery.isError;
  const ready = !!catalog.data && !!stats;
  const retry = () => {
    catalog.refetch();
    statsQuery.refetch();
  };

  const name = stats ? (patchName(stats, updates) ?? 'This') : null;
  return (
    <section aria-label="This patch" style={{ ...styles.container, padding: isMobile ? '0 12px 16px' : '0 20px 20px' }}>
      <header ref={bannerRef} style={{ ...styles.banner, height: isMobile ? '185px' : '210px' }}>
        <div style={styles.bannerText}>
          <h2 aria-label={name ? `${name} Patch` : 'Patch'} style={{ ...styles.wordmark, color: theme.text.primary }}>
            <MonthLine name={name} isMobile={isMobile} />
            <span style={{ ...styles.wordmarkBottom, fontSize: isMobile ? '40px' : '50px' }}>PATCH</span>
          </h2>
          {stats && <p style={{ ...styles.bannerSub, color: theme.text.secondary }}>{battlesLine(stats)}</p>}
          {updates[0] && (
            <a href={updates[0].notesUrl} target="_blank" rel="noreferrer" style={{ ...styles.notesLink, color: theme.accent }}>
              Official patch notes ↗
            </a>
          )}
        </div>
      </header>

      {!catalog.isError && (
        <BalanceChanges
          updates={updates}
          cardById={cardById}
          statById={statById}
          loading={patch.isPending || catalog.isPending}
          failed={patch.isError}
          onRetry={() => patch.refetch()}
          retrying={patch.isFetching}
          isMobile={isMobile}
        />
      )}

      {failed && (
        <LoadError
          title="Couldn't load this patch's numbers"
          message="Something went wrong on our end. Please try again in a moment."
          onRetry={retry}
          retrying={catalog.isFetching || statsQuery.isFetching}
          style={styles.inlineError}
        />
      )}

      {!failed && !ready && (
        <>
          <MoverSkeleton title="Biggest play rate changes" isMobile={isMobile} />
          <MoverSkeleton title="Biggest win rate changes" isMobile={isMobile} />
        </>
      )}

      {stats && catalog.data && stats.isLastPatch && (
        <Panel title="Biggest changes" isMobile={isMobile}>
          <p style={{ ...styles.empty, color: theme.text.secondary }}>
            This patch's war battles aren't in yet, so there's nothing to compare. Check back in a day or two.
          </p>
        </Panel>
      )}

      {stats && catalog.data && !stats.isLastPatch && (
        <>
          <MoverRow
            title="Biggest play rate changes"
            sub="Share of war decks with the card, last patch → this patch"
            empty="No card has enough games in both patches to compare yet."
            movers={playRateMovers(stats.cards)}
            cardById={cardById}
            isMobile={isMobile}
          />
          <MoverRow
            title="Biggest win rate changes"
            sub="War win rate, last patch → this patch. Only changes too big to be chance."
            empty="No card's win rate has moved more than chance alone would explain yet."
            movers={winRateMovers(stats.cards)}
            cardById={cardById}
            isMobile={isMobile}
          />
        </>
      )}

      <div style={styles.more}>
        <Link to="/best-decks" style={{ ...styles.moreButton, backgroundColor: theme.accent, color: theme.onAccent }}>
          Best war decks this patch →
        </Link>
      </div>
    </section>
  );
}

const battlesLine = (stats: CardStatsResponse): string => {
  const battles = `${stats.battles.toLocaleString('en-US')} war battles in the top 100 war clans`;
  if (stats.isLastPatch) return `This patch's war battles aren't in yet. Last patch had ${battles}.`;
  if (!stats.since) return `${battles} over the last 30 days`;
  return battles;
};

function MonthLine({ name, isMobile }: { name: string | null; isMobile: boolean }) {
  const style = { ...styles.wordmarkTop, fontSize: isMobile ? '30px' : '37px' };
  if (!name) return <span className="skeleton" style={{ ...style, ...styles.monthSkeleton }} aria-hidden="true" />;
  return <span style={style}>{name.toUpperCase()}</span>;
}

function Panel({ title, sub, link = false, isMobile, children }: { title: string; sub?: string; link?: boolean; isMobile: boolean; children: ReactNode }) {
  const theme = getTheme();
  return (
    <section style={{ padding: isMobile ? '14px 0 8px' : '16px 0 10px' }}>
      <div style={styles.panelHead}>
        <h3 style={{ ...styles.panelTitle, fontSize: isMobile ? '16px' : '17px', color: theme.text.primary }}>{title}</h3>
        {link && (
          <Link to="/cards" style={{ ...styles.panelLink, color: theme.accent }}>
            All cards →
          </Link>
        )}
      </div>
      {sub && <p style={{ ...styles.panelSub, color: theme.text.secondary }}>{sub}</p>}
      {children}
    </section>
  );
}

interface BalanceChangesProps {
  updates: BalanceUpdate[];
  cardById: Map<number, CatalogCard>;
  statById: Map<number, CardStat>;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  retrying: boolean;
  isMobile: boolean;
}

function BalanceChanges({ updates, cardById, statById, loading, failed, onRetry, retrying, isMobile }: BalanceChangesProps) {
  const theme = getTheme();
  if (failed) {
    return (
      <Panel title="Balance changes" isMobile={isMobile}>
        <LoadError
          title="Couldn't load the balance changes"
          message="Something went wrong on our end. Please try again in a moment."
          onRetry={onRetry}
          retrying={retrying}
          style={styles.inlineError}
        />
      </Panel>
    );
  }
  if (loading) {
    return (
      <Panel title="Balance changes" isMobile={isMobile}>
        <div role="status" aria-label="Loading the balance changes" style={styles.scroller}>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skeleton" style={{ ...styles.changeSkeleton, flexBasis: isMobile ? '150px' : '168px' }} />
          ))}
        </div>
      </Panel>
    );
  }
  if (updates.length === 0) return null;

  const showDates = updates.length > 1;
  return (
    <Panel title="Balance changes" sub="What changed, and each card's war win rate since last patch" isMobile={isMobile}>
      {updates.map((update) => (
        <div key={update.liveFrom}>
          {showDates && <h4 style={{ ...styles.updateDate, color: theme.text.tertiary }}>{updateDate(update.liveFrom)}</h4>}
          <div style={styles.scroller}>
            {update.changes.flatMap((change) => {
              const card = cardById.get(change.cardId);
              if (!card) return [];
              return [<ChangeCard key={`${change.cardId}-${change.version}`} change={change} card={card} stat={statById.get(change.cardId)} isMobile={isMobile} />];
            })}
          </div>
        </div>
      ))}
    </Panel>
  );
}

function ChangeCard({ change, card, stat, isMobile }: { change: BalanceChange; card: CatalogCard; stat: CardStat | undefined; isMobile: boolean }) {
  const theme = getTheme();
  const kindColor = KIND_COLOR[change.kind];
  return (
    <div style={{ ...styles.changeSlot, width: isMobile ? '150px' : '168px' }}>
      <CardLink name={card.name}>
        <div style={styles.changeCard}>
          <div style={{ ...styles.changeTop, background: `radial-gradient(circle at 50% 55%, color-mix(in srgb, ${kindColor} 30%, transparent) 0, transparent 46px)` }}>
            <div style={styles.changeArt}>
              <CardTile
                name={card.name}
                iconUrl={cardIconUrl(card.iconUrls, change.version)}
                elixirCost={card.elixirCost}
                showName={false}
                lazyLoad
                artStyle={{ boxShadow: `0 0 0 2px color-mix(in srgb, ${kindColor} 60%, transparent), 0 6px 16px color-mix(in srgb, ${kindColor} 30%, transparent)` }}
              />
            </div>
          </div>
          <div style={{ ...styles.changeName, color: theme.text.primary }}>
            {VERSION_PREFIX[change.version]}
            {card.name}
          </div>
          <div style={styles.changeKind}>
            <span style={{ ...styles.kindPill, color: kindColor, backgroundColor: `color-mix(in srgb, ${kindColor} 16%, transparent)` }}>{KIND_LABEL[change.kind]}</span>
          </div>
          <p style={{ ...styles.changeNote, color: theme.text.secondary }}>
            {change.summary.split('\n').map((line, i) => (
              <StatLine key={i} line={line} />
            ))}
          </p>
          {stat && stat.winRateChange != null && (
            <div style={styles.changeWinRate}>
              <span className="visually-hidden">War win rate </span>
              <ChangePill change={stat.winRateChange} isClear={stat.changeIsClear} />
            </div>
          )}
        </div>
      </CardLink>
    </div>
  );
}

// "Damage: 212 → 202" keeps its numbers together, so a narrow card breaks after the stat name instead of mid-change.
function StatLine({ line }: { line: string }) {
  const theme = getTheme();
  const colon = line.indexOf(': ');
  if (colon < 0 || !line.includes('→')) return <span style={styles.statLine}>{line}</span>;
  return (
    <span style={styles.statLine}>
      {line.slice(0, colon + 2)}
      <b style={{ ...styles.statValue, color: theme.text.primary }}>{line.slice(colon + 2)}</b>
    </span>
  );
}

interface MoverRowProps {
  title: string;
  sub: string;
  empty: string;
  movers: Mover[];
  cardById: Map<number, CatalogCard>;
  isMobile: boolean;
}

function MoverRow({ title, sub, empty, movers, cardById, isMobile }: MoverRowProps) {
  const theme = getTheme();
  const shown = movers.flatMap((mover) => {
    const card = cardById.get(mover.stat.id);
    return card ? [{ mover, card }] : [];
  });
  return (
    <Panel title={title} sub={sub} link isMobile={isMobile}>
      {shown.length === 0 && <p style={{ ...styles.empty, color: theme.text.secondary }}>{empty}</p>}
      {shown.length > 0 && (
        <div style={styles.scroller}>
          {shown.map(({ mover, card }) => (
            <div key={card.id} style={{ ...styles.tile, flexBasis: isMobile ? '74px' : '86px', width: isMobile ? '74px' : '86px' }}>
              <CardLink name={card.name}>
                <CardTile
                  name={card.name}
                  iconUrl={cardIconUrl(card.iconUrls, mostPlayedVersion(mover.stat))}
                  elixirCost={card.elixirCost}
                  nameColor={theme.text.primary}
                  nameSize="11.5px"
                  lazyLoad
                />
                <div style={styles.tileChange}>
                  <ChangePill change={mover.change} large />
                </div>
                <div style={{ ...styles.tileRange, color: theme.text.tertiary }}>
                  {percent(mover.from)} → <b style={{ ...styles.tileRangeTo, color: theme.text.secondary }}>{percent(mover.to)}</b>
                </div>
              </CardLink>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MoverSkeleton({ title, isMobile }: { title: string; isMobile: boolean }) {
  return (
    <Panel title={title} link isMobile={isMobile}>
      <div role="status" aria-label={`Loading ${title.toLowerCase()}`} style={styles.scroller}>
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          <div key={i} aria-hidden="true" style={{ ...styles.tile, flexBasis: isMobile ? '74px' : '86px', width: isMobile ? '74px' : '86px' }}>
            <span className="skeleton" style={styles.skeletonArt} />
            <span className="skeleton" style={styles.skeletonLine} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
  },
  banner: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    display: 'grid' as const,
    placeItems: 'center' as const,
    textAlign: 'center' as const,
  },
  bannerText: {
    position: 'relative' as const,
    zIndex: 1,
  },
  wordmark: {
    display: 'inline-flex' as const,
    flexDirection: 'column' as const,
    margin: 0,
    lineHeight: 1.05,
  },
  wordmarkTop: {
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textAlign: 'right' as const,
  },
  monthSkeleton: {
    display: 'block' as const,
    alignSelf: 'flex-end' as const,
    width: '6em',
    height: '1em',
    borderRadius: '4px',
  },
  wordmarkBottom: {
    fontWeight: 800 as const,
    letterSpacing: '1px',
  },
  bannerSub: {
    margin: '8px 0 0',
    fontSize: '13.5px',
  },
  notesLink: {
    display: 'inline-block' as const,
    marginTop: '8px',
    fontSize: '14px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  panelHead: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '10px',
  },
  panelTitle: {
    margin: 0,
    fontWeight: 750 as const,
  },
  panelLink: {
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  panelSub: {
    margin: '2px 0 0',
    fontSize: '13px',
  },
  updateDate: {
    margin: '12px 0 0',
    fontSize: '11px',
    fontWeight: 700 as const,
  },
  scroller: {
    display: 'flex' as const,
    gap: '12px',
    overflowX: 'auto' as const,
    padding: '12px 2px 10px',
    scrollbarWidth: 'thin' as const,
  },
  tile: {
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  tileChange: {
    marginTop: '5px',
  },
  tileRange: {
    marginTop: '3px',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  tileRangeTo: {
    fontWeight: 600 as const,
  },
  changeSlot: {
    flexShrink: 0,
    display: 'grid' as const,
  },
  changeCard: {
    position: 'relative' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    boxSizing: 'border-box' as const,
    borderRadius: '14px',
    backgroundColor: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    overflow: 'hidden' as const,
    textAlign: 'center' as const,
  },
  changeTop: {
    padding: '14px 0 4px',
  },
  changeArt: {
    width: '66px',
    margin: '0 auto',
  },
  changeName: {
    margin: '8px 8px 0',
    fontSize: '13.5px',
    fontWeight: 700 as const,
    lineHeight: 1.2,
  },
  changeKind: {
    marginTop: '5px',
  },
  kindPill: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    height: '19px',
    padding: '0 7px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700 as const,
  },
  changeNote: {
    margin: '6px 10px 0',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  statLine: {
    display: 'block' as const,
  },
  statValue: {
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
  },
  changeWinRate: {
    display: 'flex' as const,
    justifyContent: 'center' as const,
    marginTop: 'auto',
    padding: '8px 0 10px',
  },
  changeSkeleton: {
    display: 'block' as const,
    flexShrink: 0,
    height: '200px',
    borderRadius: '14px',
  },
  empty: {
    margin: 0,
    padding: '14px 0 10px',
    fontSize: '14px',
  },
  inlineError: {
    minHeight: 0,
    padding: '20px 16px',
  },
  more: {
    display: 'flex' as const,
    justifyContent: 'center' as const,
    paddingTop: '14px',
  },
  moreButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '10px 22px',
    borderRadius: '999px',
    fontSize: '15px',
    fontWeight: 700 as const,
    textDecoration: 'none',
  },
  skeletonArt: {
    display: 'block' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
  },
  skeletonLine: {
    display: 'block' as const,
    height: '14px',
    margin: '8px 8px 0',
    borderRadius: '4px',
  },
};
