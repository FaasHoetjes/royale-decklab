import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlayerWarDecks, useUpgradeAdvice } from '../queries';
import UpgradeRow from '../components/UpgradeRow';
import { SearchIcon } from '../components/navIcons';
import UpgradePreview, { type LineupDeck } from '../components/UpgradePreview';
import { UpgradeAdvisorSkeleton } from '../components/LoadingSkeletons';
import LoadError from '../components/LoadError';
import { classifyDeck, distinctDeckNames, featuredCard } from '../lib/archetypes';
import { cardIconUrl, versionOf } from '../lib/cardDisplay';
import type { UpgradeSuggestion } from '../api';

const INITIAL_ROWS = 10;

function effectOf(s: UpgradeSuggestion, lineup: LineupDeck[] | null, unlockedName: string): string {
  if (s.changesLineup && s.unlockedDeck) return `brings in ${unlockedName}`;
  if (s.changesLineup) return 'changes your lineup';
  const decks = s.affectedDeckIndexes.map((i) => lineup?.[i]?.name ?? `Deck ${i + 1}`);
  return decks.length ? `strengthens ${decks.join(' and ')}` : 'raises your lineup score';
}

export default function UpgradeAdvisor() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(0);
  const [pick, setPick] = useState(0);
  useEffect(() => setSelected(0), [activePlayerTag]);

  const advice = useUpgradeAdvice(activePlayerTag);
  // The advice is measured against the default lineup, so the deck indexes point into it.
  const warDecks = usePlayerWarDecks(activePlayerTag);
  const data = advice.data;
  const suggestions = data?.suggestions ?? [];
  const visible = expanded ? suggestions : suggestions.slice(0, INITIAL_ROWS);

  const lineupDecks = warDecks.data?.warDecks.decks;
  const lineup = useMemo<LineupDeck[] | null>(() => {
    if (!lineupDecks?.length) return null;
    const names = distinctDeckNames(lineupDecks.map((d) => d.cards));
    return lineupDecks.map((deck, i) => {
      const card = featuredCard(deck.cards);
      return {
        name: names[i] ?? classifyDeck(deck.cards).name,
        score: deck.playerScore,
        iconUrl: card ? cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id)) : '',
      };
    });
  }, [lineupDecks]);

  // A new deck is named next to the lineup it joins, so a second Royal Giant deck gets told apart.
  const unlockedNames = useMemo(
    () =>
      suggestions.map((s) => {
        if (!s.unlockedDeck) return '';
        if (!lineupDecks?.length) return classifyDeck(s.unlockedDeck.cards).name;
        return distinctDeckNames([...lineupDecks.map((d) => d.cards), s.unlockedDeck.cards]).at(-1) ?? '';
      }),
    [suggestions, lineupDecks]
  );

  // Fetched ahead, so a new deck's cards don't load and decode while they pop in.
  const newDeckArt = visible
    .flatMap(({ unlockedDeck: deck }) => deck?.cards.map((card) => cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))) ?? [])
    .join(' ');
  useEffect(() => {
    if (!newDeckArt) return;
    new Set(newDeckArt.split(' ')).forEach((url) => {
      const img = new Image();
      img.src = url;
      img.decode().catch(() => {});
    });
  }, [newDeckArt]);

  const shown = Math.min(selected, suggestions.length - 1);
  const current = suggestions[shown];
  const choose = (i: number) => {
    if (i === shown) return;
    setSelected(i);
    setPick((p) => p + 1);
  };

  function renderBody() {
    if (!activePlayerTag) return <NeedsTag isMobile={isMobile} />;
    if (advice.isLoading) return <UpgradeAdvisorSkeleton isMobile={isMobile} />;
    if (advice.isError) {
      return (
        <LoadError
          title="Couldn't load your upgrade advice"
          message="Something went wrong on our end. Please try again in a moment."
          onRetry={() => advice.refetch()}
          retrying={advice.isFetching}
        />
      );
    }
    if (data && suggestions.length === 0) {
      return (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          {data.collectionMaxed ? (
            <>
              <p style={{ ...styles.panelTitle, color: theme.text.primary }}>
                All relevant upgrades are complete
              </p>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                Every card used in the current meta is maxed, and its Evolutions and Heroes are
                unlocked. Check back when the meta changes or new cards arrive.
              </p>
            </>
          ) : (
            <>
              <p style={{ ...styles.panelTitle, color: theme.text.primary }}>
                Your recommended lineup is fully upgraded
              </p>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                No available upgrade improves your recommended lineup or brings in a stronger deck.
                Check back when the meta changes.
              </p>
            </>
          )}
        </div>
      );
    }
    if (!data || !current) return null;
    return (
      <>
        <UpgradePreview
          suggestion={current}
          pick={pick}
          baselineScore={data.baselineScore}
          lineup={lineup}
          unlockedName={unlockedNames[shown] ?? ''}
          effect={effectOf(current, lineup, unlockedNames[shown] ?? '')}
          theme={theme}
          isMobile={isMobile}
        />

        <h3 style={{ ...styles.listTitle, color: theme.text.secondary }}>
          All {suggestions.length} upgrades
        </h3>
        <div>
          {visible.map((s, i) => (
            <UpgradeRow
              key={`${s.cardId}-${s.kind}-${s.toLevel}`}
              rank={i + 1}
              suggestion={s}
              effect={effectOf(s, lineup, unlockedNames[i] ?? '')}
              selected={i === shown}
              onSelect={() => choose(i)}
              theme={theme}
              isMobile={isMobile}
            />
          ))}
        </div>
        {suggestions.length > INITIAL_ROWS && (
          <button
            type="button"
            className="mobile-touch-target"
            onClick={() => setExpanded((e) => !e)}
            style={{ ...styles.showMore, color: theme.text.primary }}
          >
            {expanded ? 'Show fewer' : `Show all ${suggestions.length}`}
          </button>
        )}
      </>
    );
  }

  const needsTag = !activePlayerTag;

  return (
    <div
      className={needsTag ? 'fills-page' : undefined}
      style={{ ...styles.container, ...(needsTag ? styles.fillContainer : {}), padding: isMobile ? '4px 0' : '20px 0' }}
    >
      <div style={{ marginBottom: isMobile ? '18px' : '26px' }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>Upgrade Advisor</h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          See which card upgrades raise your war lineup score the most.
        </p>
      </div>

      {needsTag ? <div style={styles.centered}>{renderBody()}</div> : renderBody()}
    </div>
  );
}

const GHOST_ROWS = [
  { name: '45%', sub: '70%', gain: '+4.2' },
  { name: '35%', sub: '60%', gain: '+3.1' },
  { name: '50%', sub: '66%', gain: '+2.6' },
  { name: '40%', sub: '55%', gain: '+1.9' },
  { name: '30%', sub: '62%', gain: '+1.4' },
];

/** A faded stand-in for the upgrade list behind the prompt, hinting at what a tag unlocks. */
function NeedsTag({ isMobile }: { isMobile: boolean }) {
  const theme = getTheme();
  return (
    <div style={styles.needsTag}>
      <div aria-hidden="true" style={styles.ghost}>
        {GHOST_ROWS.map((row) => (
          <div key={row.gain} style={styles.ghostRow}>
            <span style={styles.ghostArt} />
            <span style={styles.ghostLines}>
              <span style={{ ...styles.ghostLine, width: row.name }} />
              <span style={{ ...styles.ghostLine, width: row.sub }} />
            </span>
            <span style={{ ...styles.ghostGain, color: theme.accent }}>{row.gain}</span>
          </div>
        ))}
      </div>
      <div style={{ ...styles.needsTagCard, padding: isMobile ? '24px 18px 20px' : '26px 22px 22px' }}>
        <div style={{ ...styles.needsTagIcon, color: theme.accent }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <p style={{ ...styles.panelText, color: theme.text.secondary }}>
          Upgrade advice uses your card collection. Search your player tag first.
        </p>
        <Link to="/" style={{ ...styles.panelButton, ...styles.needsTagButton, backgroundColor: theme.accent, color: theme.onAccent }}>
          <SearchIcon />
          Search your player tag
        </Link>
      </div>
    </div>
  );
}

const styles = {
  needsTag: {
    position: 'relative' as const,
  },
  ghost: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
    opacity: 0.55,
    maskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    pointerEvents: 'none' as const,
  },
  ghostRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    padding: '10px 12px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  ghostArt: {
    width: '34px',
    aspectRatio: '0.82',
    borderRadius: '7px',
    backgroundColor: 'var(--skeleton-base)',
    flexShrink: 0,
  },
  ghostLines: {
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
  },
  ghostLine: {
    display: 'block' as const,
    height: '10px',
    borderRadius: '5px',
    backgroundColor: 'var(--skeleton-base)',
  },
  ghostGain: {
    fontFamily: "'Baloo 2', system-ui, -apple-system, sans-serif",
    fontWeight: 800 as const,
    fontSize: '15px',
  },
  needsTagCard: {
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(400px, calc(100% - 24px))',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--panel-border)',
    borderRadius: '18px',
    boxShadow: 'var(--dialog-shadow)',
  },
  needsTagIcon: {
    width: '56px',
    height: '56px',
    margin: '0 auto 14px',
    borderRadius: '16px',
    display: 'grid' as const,
    placeItems: 'center' as const,
    backgroundColor: 'var(--accent-a20)',
  },
  needsTagButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    marginTop: '16px',
    padding: '11px 22px',
    borderRadius: '10px',
  },
  container: {
    maxWidth: '760px',
    margin: '0 auto',
  },
  fillContainer: {
    flex: 1,
    width: '100%',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  centered: {
    flex: 1,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
  },
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
  },
  panel: {
    border: '1px solid',
    borderRadius: '12px',
    padding: '28px 24px',
    textAlign: 'center' as const,
  },
  panelTitle: {
    fontSize: '17px',
    fontWeight: 700 as const,
    margin: '0 0 8px',
  },
  panelText: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 4px',
  },
  panelButton: {
    display: 'inline-block' as const,
    marginTop: '14px',
    padding: '10px 22px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600 as const,
  },
  listTitle: {
    margin: '0 0 6px',
    fontSize: '14px',
    fontWeight: 700 as const,
  },
  showMore: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    marginTop: '14px',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
  },
};
