import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme, type Theme } from '../theme';
import { useAllCards, useCardDecks, useCardStats } from '../queries';
import type { CardStat, CatalogCard } from '../api';
import { useIsMobile } from '../hooks/useIsMobile';
import { FOLD_EASING, prefersReducedMotion } from '../lib/motion';
import { cardIconUrl } from '../lib/cardDisplay';
import { cardSlug, cardType, mostPlayedVersion, specialVersions } from '../lib/cardInfo';
import { cardRanks, isLowSample, percent } from '../lib/cardStats';
import { distinctDeckNames } from '../lib/archetypes';
import { parseOptions, toQuery } from '../lib/generatorOptions';
import { homePath, SITE_NAME } from '../components/navItems';
import CardTile from '../components/CardTile';
import BestDeckRow from '../components/BestDeckRow';
import WinRateChange from '../components/WinRateChange';
import LoadError from '../components/LoadError';
import { BestDecksSkeleton } from '../components/LoadingSkeletons';
import NotFound from './NotFound';
import { periodNote } from './Cards';

const EVO_COLOR = '#b14bff';
const HERO_COLOR = '#f5a623';
const VERSION_SLOT = { evo: 0, hero: 1, normal: undefined } as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function specialVersionLabel(versions: { evo: boolean; hero: boolean }): string | null {
  if (versions.evo && versions.hero) return 'has Evo and Hero';
  if (versions.evo) return 'has an Evo';
  if (versions.hero) return 'has a Hero';
  return null;
}

/** The generator with this card required, for the active player; without one, the landing page carries it to the generator. */
function buildLink(cardId: number, activePlayerTag: string | null): string {
  const query = toQuery({ ...parseOptions(new URLSearchParams()), require: [cardId] });
  return `${activePlayerTag ? homePath(activePlayerTag) : '/'}?${query}`;
}

export default function CardPage() {
  const { slug } = useParams();
  const catalog = useAllCards();
  const card = catalog.data?.find((c) => cardSlug(c.name) === slug);

  if (catalog.isError) {
    return (
      <LoadError
        title="Couldn't load this card"
        message="Something went wrong on our end. Please try again in a moment."
        onRetry={() => catalog.refetch()}
        retrying={catalog.isFetching}
      />
    );
  }
  if (!catalog.data) return null;
  if (!card) return <NotFound />;
  return <CardDetails key={card.id} card={card} />;
}

const lockIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

/**
 * On phones, whether the build button in the card panel has scrolled up under the header while the end of the
 * deck list is still below, which is when the floating copy of it shows.
 */
function usePastBuildButton(enabled: boolean) {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pastButton, setPastButton] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!enabled || !buttonRef.current || !endRef.current) return;
    const button = buttonRef.current;
    const header = 60;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === button) setPastButton(!entry.isIntersecting && entry.boundingClientRect.top < header);
          else setAtEnd(entry.isIntersecting);
        }
      },
      { rootMargin: `-${header}px 0px 0px 0px` }
    );
    observer.observe(button);
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [enabled]);

  return { buttonRef, endRef, floating: enabled && pastButton && !atEnd };
}

function CardDetails({ card }: { card: CatalogCard }) {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const build = usePastBuildButton(isMobile);
  const statsQuery = useCardStats();
  const decksQuery = useCardDecks(card.id);

  const stats = statsQuery.data;
  const stat = stats?.cards.find((s) => s.id === card.id);
  const ranks = useMemo(() => (stats ? cardRanks(stats.cards) : null), [stats]);
  const deckNames = useMemo(() => distinctDeckNames((decksQuery.data?.decks ?? []).map((d) => d.cards)), [decksQuery.data]);

  useEffect(() => {
    document.title = `Best ${card.name} War Decks & Win Rate · ${SITE_NAME}`;
    const numbers = stat
      ? `${percent(stat.winRate)} win rate, ${percent(stat.playRate)} play rate and its change`
      : 'its win rate, play rate and change';
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', `The best ${card.name} decks for Clash Royale Clan War, ranked on real war battles: ${numbers} since the last balance update.`);
  }, [card.name, stat]);

  const versions = specialVersions(card.maxEvolutionLevel);
  const isChampion = card.rarity === 'champion';
  const shownVersion = mostPlayedVersion(stat);
  const facts = [
    card.elixirCost != null ? `${card.elixirCost} elixir` : null,
    card.rarity ? capitalize(card.rarity) : null,
    cardType(card.id),
    specialVersionLabel(versions),
  ].filter(Boolean);

  const rough = stat ? isLowSample(stat) : false;
  const buildHref = buildLink(card.id, activePlayerTag);
  const comparing = stats?.cards.some((s) => s.winRateChange != null) ?? false;
  const winRank = ranks?.winRank.get(card.id);
  const playRank = ranks?.playRank.get(card.id);

  const art = (
    <div style={{ width: isMobile ? '92px' : '148px', flexShrink: 0 }}>
      <CardTile
        name={card.name}
        iconUrl={cardIconUrl(card.iconUrls, shownVersion)}
        slotIndex={VERSION_SLOT[shownVersion]}
        elixirCost={card.elixirCost}
        showName={false}
        fetchPriority="high"
      />
    </div>
  );

  const statTiles = stat && stats && (
    <div style={{ ...styles.tiles, ...(isMobile ? styles.tilesMobile : {}) }}>
      <StatTile theme={theme} value={percent(stat.winRate)} label="win rate">
        {stat.winRateChange != null ? (
          <WinRateChange stat={stat} large detailed />
        ) : (
          comparing && (
            <span style={{ color: theme.text.secondary, fontWeight: 500 }}>
              {stat.previousGames === 0 ? 'Not played last patch' : 'Too few games to compare with last patch'}
            </span>
          )
        )}
      </StatTile>
      <StatTile theme={theme} value={percent(stat.playRate)} label="play rate">
        {playRank && <span style={{ color: theme.text.secondary }}>#{playRank} most played</span>}
      </StatTile>
      {winRank && ranks ? (
        <StatTile theme={theme} value={`#${winRank}`} label={`win rate rank of ${ranks.rankedCount}`} />
      ) : (
        <StatTile theme={theme} value={stat.games.toLocaleString('en-US')} label="games" />
      )}
    </div>
  );

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <Link to="/cards" style={{ ...styles.back, color: theme.accent }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        All cards
      </Link>

      <section style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        {isMobile ? (
          <div style={styles.headTop}>
            {art}
            <div style={{ minWidth: 0 }}>
              <h1 style={{ ...styles.name, fontSize: '24px', color: theme.text.primary }}>{card.name}</h1>
              <div style={{ ...styles.facts, marginTop: '6px', color: theme.text.secondary }}>{facts.join(' · ')}</div>
            </div>
          </div>
        ) : (
          art
        )}
        <div style={styles.headBody}>
          {!isMobile && (
            <>
              <h1 style={{ ...styles.name, color: theme.text.primary }}>{card.name}</h1>
              <div style={{ ...styles.facts, color: theme.text.secondary }}>{facts.join(' · ')}</div>
            </>
          )}
          {statsQuery.isLoading && <span className="skeleton" style={styles.tilesSkeleton} />}
          {statTiles}
          {stats && !stat && (
            <p style={{ ...styles.note, color: theme.text.secondary }}>Nobody in the top war clans has played {card.name} in a war battle this patch.</p>
          )}
          {stat && stats && (stats.isLastPatch || rough) && (
            <p style={{ ...styles.note, color: theme.text.secondary }}>
              {stats.isLastPatch && periodNote(stats)}
              {stats.isLastPatch && rough && ' '}
              {rough && `Only ${stat.games.toLocaleString('en-US')} games, so these numbers are rough.`}
            </p>
          )}
          {stat && (versions.evo || versions.hero) && !isChampion && <PlaySplit theme={theme} stat={stat} />}
          {isMobile && (
            <div style={styles.buildPanel}>
              <Link ref={build.buttonRef} to={buildHref} style={{ ...styles.buildButton, ...styles.buildButtonWide, backgroundColor: theme.accent, color: theme.onAccent }}>
                {lockIcon}
                Build my best war decks with {card.name}
              </Link>
              <p style={{ ...styles.buildCaption, color: theme.text.secondary }}>
                Your 4 best war decks from your own cards, with {card.name} in one of them.
              </p>
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: isMobile ? '22px' : '30px' }}>
        <div style={{ ...styles.decksHead, ...(isMobile ? styles.decksHeadMobile : {}) }}>
          <h2 style={{ ...styles.decksTitle, color: theme.text.primary }}>Best war decks with {card.name}</h2>
          {!isMobile && (
            <Link to={buildHref} style={{ ...styles.buildButton, backgroundColor: theme.accent, color: theme.onAccent }}>
              {lockIcon}
              Build my best war decks with {card.name}
            </Link>
          )}
        </div>

        {decksQuery.isLoading && <BestDecksSkeleton isMobile={isMobile} />}
        {decksQuery.isError && (
          <LoadError
            title="Couldn't load the decks"
            message="Something went wrong on our end. Please try again in a moment."
            onRetry={() => decksQuery.refetch()}
            retrying={decksQuery.isFetching}
          />
        )}
        {decksQuery.data && decksQuery.data.decks.length === 0 && (
          <p style={{ ...styles.note, color: theme.text.secondary }}>
            No war deck with {card.name} has been played by five or more players yet, so there's none to rank.
          </p>
        )}
        {decksQuery.data && decksQuery.data.decks.length > 0 && (
          <div style={styles.deckList}>
            {decksQuery.data.decks.map((deck, i) => (
              <BestDeckRow key={deck.cardIds.join(',')} deck={deck} name={deckNames[i] ?? `Deck ${i + 1}`} theme={theme} isMobile={isMobile} />
            ))}
          </div>
        )}
        <div ref={build.endRef} />
      </section>

      {isMobile && (
        <div style={styles.buildFloat}>
          <Link
            to={buildHref}
            aria-hidden={!build.floating}
            tabIndex={build.floating ? undefined : -1}
            style={{
              ...styles.buildButton,
              ...styles.buildPill,
              backgroundColor: theme.accent,
              color: theme.onAccent,
              opacity: build.floating ? 1 : 0,
              transform: build.floating ? 'none' : 'translateY(16px)',
              pointerEvents: build.floating ? 'auto' : 'none',
              transition: prefersReducedMotion() ? 'none' : `opacity 200ms ${FOLD_EASING}, transform 200ms ${FOLD_EASING}`,
            }}
          >
            {lockIcon}
            Build with {card.name}
          </Link>
        </div>
      )}
    </div>
  );
}

function StatTile({ theme, value, label, children }: { theme: Theme; value: string; label: string; children?: ReactNode }) {
  return (
    <div style={{ ...styles.tile, backgroundColor: theme.bg.tertiary }}>
      <div style={{ ...styles.tileValue, color: theme.text.primary }}>{value}</div>
      <div style={{ ...styles.tileLabel, color: theme.text.secondary }}>{label}</div>
      {children && <div style={styles.tileExtra}>{children}</div>}
    </div>
  );
}

function PlaySplit({ theme, stat }: { theme: Theme; stat: CardStat }) {
  const parts = [
    { label: 'Evo', share: stat.evoShare, color: EVO_COLOR },
    { label: 'Hero', share: stat.heroShare, color: HERO_COLOR },
    { label: 'Normal', share: Math.max(0, 1 - stat.evoShare - stat.heroShare), color: 'var(--text-tertiary)' },
  ].filter((p) => p.share > 0);
  return (
    <div style={styles.split}>
      <div style={{ ...styles.splitTitle, color: theme.text.primary }}>How it's played</div>
      <div style={styles.splitBar} role="img" aria-label={parts.map((p) => `${p.label} ${percent(p.share, 0)}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} style={{ width: `${p.share * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <div style={{ ...styles.legend, color: theme.text.secondary }}>
        {parts.map((p) => (
          <span key={p.label} style={styles.legendItem}>
            <i style={{ ...styles.legendDot, backgroundColor: p.color }} />
            {p.label} <b style={{ color: theme.text.primary }}>{percent(p.share, 0)}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  back: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    marginBottom: '12px',
    fontSize: '14px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  header: {
    display: 'flex' as const,
    gap: '30px',
    alignItems: 'center' as const,
    padding: '26px 30px',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
  },
  headerMobile: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    gap: '16px',
    padding: '16px 14px',
  },
  headTop: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '16px',
  },
  headBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '14px',
  },
  name: {
    margin: 0,
    fontSize: '30px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  facts: {
    marginTop: '-8px',
    fontSize: '14px',
  },
  tiles: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(3, minmax(0, 168px))',
    gap: '10px',
  },
  tilesMobile: {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '8px',
  },
  tilesSkeleton: {
    display: 'block' as const,
    height: '86px',
    maxWidth: '520px',
    borderRadius: '12px',
  },
  tile: {
    padding: '10px 14px',
    borderRadius: '12px',
    minWidth: 0,
  },
  tileValue: {
    fontSize: '22px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    lineHeight: 1.15,
  },
  tileLabel: {
    fontSize: '12px',
    marginTop: '2px',
  },
  tileExtra: {
    marginTop: '4px',
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  note: {
    margin: 0,
    fontSize: '13px',
    lineHeight: 1.5,
  },
  split: {
    maxWidth: '520px',
  },
  splitTitle: {
    fontSize: '13px',
    fontWeight: 700 as const,
    marginBottom: '8px',
  },
  splitBar: {
    display: 'flex' as const,
    gap: '2px',
    height: '12px',
    borderRadius: '999px',
    overflow: 'hidden' as const,
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '6px 16px',
    marginTop: '8px',
    fontSize: '13px',
  },
  legendItem: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
  },
  legendDot: {
    width: '9px',
    height: '9px',
    borderRadius: '3px',
  },
  decksHead: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '16px',
    marginBottom: '14px',
  },
  decksHeadMobile: {
    flexDirection: 'column' as const,
    alignItems: 'stretch' as const,
    gap: '10px',
  },
  decksTitle: {
    margin: 0,
    fontSize: '20px',
  },
  buildButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    padding: '10px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  buildPanel: {
    marginTop: '16px',
  },
  buildButtonWide: {
    display: 'flex' as const,
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '13px 16px',
    fontSize: '15px',
    whiteSpace: 'normal' as const,
    textAlign: 'center' as const,
  },
  buildCaption: {
    margin: '8px 0 0',
    fontSize: '13px',
    lineHeight: 1.45,
    textAlign: 'center' as const,
  },
  buildFloat: {
    position: 'fixed' as const,
    left: '12px',
    right: '12px',
    bottom: 'calc(76px + env(safe-area-inset-bottom))',
    zIndex: 850,
    display: 'flex' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  buildPill: {
    padding: '11px 20px',
    borderRadius: '999px',
    fontSize: '15px',
    maxWidth: '100%',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  },
  deckList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
  },
};
