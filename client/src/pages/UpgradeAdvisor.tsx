import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePlayerWarDecks, useUpgradeAdvice } from '../queries';
import UpgradeRow from '../components/UpgradeRow';
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

  const current = suggestions[Math.min(selected, suggestions.length - 1)];
  const choose = (i: number) => {
    if (i === selected) return;
    setSelected(i);
    setPick((p) => p + 1);
  };

  function renderBody() {
    if (!activePlayerTag) {
      return (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          <p style={{ ...styles.panelText, color: theme.text.secondary }}>
            Upgrade advice uses your card collection. Search your player tag first.
          </p>
          <Link
            to="/"
            style={{ ...styles.panelButton, backgroundColor: theme.text.primary, color: theme.bg.primary }}
          >
            Search your player tag
          </Link>
        </div>
      );
    }
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
          unlockedName={unlockedNames[selected] ?? ''}
          effect={effectOf(current, lineup, unlockedNames[selected] ?? '')}
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
              selected={i === selected}
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

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div
        style={{
          ...styles.header,
          borderBottomColor: theme.border,
          marginBottom: isMobile ? '18px' : '24px',
          paddingBottom: isMobile ? '14px' : '18px',
        }}
      >
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>Upgrade Advisor</h1>
        <p style={{ ...styles.subtitle, marginTop: isMobile ? 0 : '6px', color: theme.text.secondary }}>
          {data && suggestions.length > 0
            ? 'Pick an upgrade to see what it does to your war lineup.'
            : 'Which card upgrade raises your war lineup the most.'}
        </p>
      </div>

      {renderBody()}
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '760px',
    margin: '0 auto',
  },
  header: {
    borderBottom: '1px solid',
  },
  subtitle: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: 0,
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
