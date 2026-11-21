import { useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useAllCards, useCrownSeriesDecks, usePlayerCollection } from '../queries';
import { isNoDuelData, type CrownSeriesLeagueId, type CrownSeriesResponse, type ScoredDeck, type SeasonBoosts } from '../api';
import { duelOptions, leagueFor, saveLeague, upgradeTargets } from '../lib/crownSeries';
import { toBuilderCards } from '../lib/builderCards';
import { DEFAULT_OPTIONS, MAX_DECKS, hasActiveOptions, toQuery, type GeneratorOptions } from '../lib/generatorOptions';
import { useOptionsQuery } from '../hooks/useOptionsQuery';
import GeneratorControls from '../components/GeneratorControls';
import Shortfall from '../components/warDeck/Shortfall';
import CrownSeriesBanner from '../components/CrownSeriesBanner';
import LeaguePicker from '../components/LeaguePicker';
import UpgradeFirst from '../components/UpgradeFirst';
import DeckCard from '../components/DeckCard';
import SwapDeckModal from '../components/SwapDeckModal';
import { useSwappableLineup } from '../hooks/useSwappableLineup';
import LoadError from '../components/LoadError';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import { SearchIcon } from '../components/navIcons';

export default function CrownSeries() {
  const { activePlayerTag } = useApp();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const league = leagueFor(searchParams.get('league'));
  const options = useMemo(() => duelOptions(searchParams), [searchParams]);
  const apiQuery = useOptionsQuery(options, toQuery(options), league.id);

  const duelDecks = useCrownSeriesDecks(activePlayerTag, league.id, apiQuery);
  // If changing options fails (e.g. the rate limit), keep showing the last decks for this player and league.
  const loadedKey = `${activePlayerTag}|${league.id}`;
  const lastLoaded = useRef<{ key: string; data: CrownSeriesResponse } | null>(null);
  if (duelDecks.data && !duelDecks.isPlaceholderData) lastLoaded.current = { key: loadedKey, data: duelDecks.data };
  const fallback = lastLoaded.current?.key === loadedKey ? lastLoaded.current.data : undefined;
  const data = duelDecks.data ?? fallback;
  const optionsFailed = duelDecks.isError && fallback != null;
  const isUpdating = !optionsFailed && duelDecks.isPlaceholderData;

  const showSearch = (leagueId: string | null, next: GeneratorOptions) => {
    const parts = [leagueId ? `league=${leagueId}` : '', toQuery(next)].filter(Boolean);
    navigate({ search: parts.length ? `?${parts.join('&')}` : '' }, { replace: true });
  };
  const changeOptions = (next: GeneratorOptions) => showSearch(searchParams.get('league'), next);
  const pickLeague = (id: CrownSeriesLeagueId) => {
    saveLeague(id);
    showSearch(id, options);
  };

  const lineup = useSwappableLineup(data?.duelDecks.decks ?? NO_DECKS, data?.duelDecks.alternatives ?? NO_DECKS, {
    locks: options.lock,
    onLocksChange: (lock) => changeOptions({ ...options, lock }),
  });
  const decks = lineup.shownDecks;
  const customized = hasActiveOptions(options);
  const resetLineup = () => {
    lineup.reset();
    if (customized) changeOptions(DEFAULT_OPTIONS);
  };

  const catalog = useAllCards();
  const collection = usePlayerCollection(data ? activePlayerTag : null);
  const pickerCards = useMemo(
    () => (catalog.data && collection.data ? toBuilderCards(catalog.data, collection.data) : []),
    [catalog.data, collection.data]
  );

  const header = (
    <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
      <h1 className={isMobile ? 'visually-hidden' : undefined} style={styles.title}>Crown Series Deck Generator</h1>
      <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined }}>
        The 4 best decks for your Crown Series Duel, optimized for your card collection and league's level cap.
      </p>
    </div>
  );

  if (!activePlayerTag) {
    return (
      <div className="fills-page" style={{ ...styles.container, ...styles.fillContainer, padding: isMobile ? '4px 0' : '20px 0' }}>
        {header}
        <div style={styles.centered}>
          <NeedsTag isMobile={isMobile} />
        </div>
      </div>
    );
  }

  const controls = (
    <>
      <div style={styles.controls}>
        <LeaguePicker league={league} onPick={pickLeague} />
      </div>
      <GeneratorControls
        rulesOnly
        options={options}
        onChange={changeOptions}
        cards={pickerCards}
        seasonBoosts={NO_BOOSTS}
        isUpdating={isUpdating}
        isMobile={isMobile}
        canReset={customized || lineup.swapped}
        onReset={resetLineup}
      />
    </>
  );

  if (duelDecks.isError && !data) {
    const noData = isNoDuelData(duelDecks.error);
    return (
      <div style={styles.container}>
        {header}
        <LoadError
          title={noData ? 'No Duels collected yet' : "Couldn't build your Duel Deck"}
          message={noData
            ? 'Decks are ranked on the Duels top players play on Crown Series weekends. Check back once the next Duel weekend starts.'
            : 'Something went wrong loading your decks. Please try again in a moment.'}
          onRetry={() => duelDecks.refetch()}
          retrying={duelDecks.isFetching}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.container}>
        {header}
        {controls}
        <WarDecksSkeleton isMobile={isMobile} />
      </div>
    );
  }

  const shownRounds = decks.reduce((sum, d) => sum + d.uses, 0);
  const leagueShare = shownRounds === 0 ? 1 : decks.reduce((sum, d) => sum + (d.leagueUses ?? 0), 0) / shownRounds;
  const averageWinChance = decks.length === 0 ? 0 : data.duelDecks.totalScore / decks.length;
  const upgrades = upgradeTargets(decks, data.levelCap);

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '20px 0' }}>
      {header}
      <CrownSeriesBanner
        league={league}
        playerName={data.player.name}
        decks={decks}
        decksLevelCap={data.levelCap}
        total={{ value: `${Math.round(averageWinChance * 100)}%`, label: 'win chance per round' }}
        scoreTip={
          <>
            <strong>Your average chance to win a round.</strong>
            <br />
            You bring all 4 decks and play 2 or 3 of them in a best of 3, so this averages their win chances. Each starts from the deck's win rate in Crown Series Duels:{' '}
            {data.duelRounds.toLocaleString()} rounds played at level {data.levelCap}
            {data.otherLeagueRounds > 0
              ? `, plus rounds from other leagues, which count for less and add up to ${data.otherLeagueRounds.toLocaleString()} more`
              : ''}
            . Then it
            factors in your card levels at the league's cap. Your opponents have about your levels, so a card below the
            cap costs a lot.
          </>
        }
        isMobile={isMobile}
      />
      {controls}
      {leagueShare < MIN_LEAGUE_SHARE && (
        <p style={styles.thinNote} role="note">
          {data.duelRounds === 0
            ? `No Duels at level ${data.levelCap} collected yet, so these picks come from Duels in other leagues.`
            : `Most rounds behind these picks were played in other leagues, since few Duels at level ${data.levelCap} have been collected so far.`}
        </p>
      )}
      {optionsFailed && (
        <p style={styles.notice} role="alert">
          Couldn't update your decks just now; the decks below are from before your last change. Wait a few seconds and{' '}
          <button type="button" onClick={() => duelDecks.refetch()} style={styles.retry}>
            try again
          </button>
          .
        </p>
      )}
      {!optionsFailed && !isUpdating && customized && decks.length < MAX_DECKS && (
        <Shortfall duel found={decks.length} options={options} onChange={changeOptions} isMobile={isMobile} />
      )}
      {upgrades.length > 0 && <UpgradeFirst targets={upgrades} levelCap={data.levelCap} isMobile={isMobile} />}
      <div style={{ ...styles.decks, gap: isMobile ? '16px' : '30px', opacity: isUpdating ? 0.55 : 1 }} aria-busy={isUpdating}>
        {decks.map((deck, i) => (
          <DeckCard
            key={i}
            cards={deck.cards}
            metaWinRate={deck.metaWinRate}
            uses={deck.uses}
            players={deck.players}
            pickRate={deck.pickRate}
            leagueUses={deck.leagueUses}
            cardVersions={deck.cardVersions}
            metaCardVersions={deck.metaCardVersions}
            cardOrder={lineup.cardOrderAt(i)}
            playerScore={deck.playerScore}
            deckNumber={i + 1}
            canSwap={!lineup.isLocked(i) && lineup.swapOptions(i).length > 1}
            onSwap={() => lineup.openSwap(i)}
            locked={lineup.isLocked(i)}
            onToggleLock={() => lineup.toggleLock(i)}
            priority={i === 0}
            source="duel"
            levelCap={data.levelCap}
          />
        ))}
      </div>
      {lineup.swapSlot != null && (
        <SwapDeckModal
          slotNumber={lineup.swapSlot + 1}
          currentMaster={lineup.slots[lineup.swapSlot] ?? -1}
          currentCardOrder={lineup.cardOrderAt(lineup.swapSlot)}
          options={lineup.swapOptions(lineup.swapSlot)}
          onSelect={(master) => lineup.selectForSlot(lineup.swapSlot!, master)}
          onClose={lineup.closeSwap}
          source="duel"
        />
      )}
    </div>
  );
}

const NO_DECKS: ScoredDeck[] = [];
const NO_BOOSTS: SeasonBoosts = { level: 0, cardIds: [] };

// Below this share of their rounds played in the league itself, the picks mostly reflect other leagues.
const MIN_LEAGUE_SHARE = 0.5;

const GHOST_DECKS = ['62%', '58%', '55%', '51%'];

/** Faded stand-in decks behind the prompt, hinting at what a tag unlocks. */
function NeedsTag({ isMobile }: { isMobile: boolean }) {
  return (
    <div style={styles.needsTag}>
      <div aria-hidden="true" style={styles.ghost}>
        {GHOST_DECKS.map((winChance) => (
          <div key={winChance} style={{ ...styles.ghostDeck, gap: isMobile ? '5px' : '8px' }}>
            <span style={styles.ghostHeader}>
              <span style={styles.ghostLine} />
              <span style={styles.ghostWinChance}>{winChance}</span>
            </span>
            <span style={{ ...styles.ghostCards, gap: isMobile ? '4px' : '6px' }}>
              {Array.from({ length: 8 }, (_, i) => <span key={i} style={styles.ghostCard} />)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...styles.needsTagCard, padding: isMobile ? '24px 18px 20px' : '26px 22px 22px' }}>
        <div style={styles.needsTagIcon}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5L3 8z" />
          </svg>
        </div>
        <p style={styles.needsTagText}>Duel Decks are built from your card collection. Search your player tag first.</p>
        <Link to="/" state={{ returnTo: '/crown-series' }} style={styles.needsTagButton}>
          <SearchIcon />
          Search your player tag
        </Link>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  title: {
    color: 'var(--text-primary)',
    margin: 0,
    fontSize: '1.5em',
  },
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
    color: 'var(--text-secondary)',
  },
  controls: {
    display: 'grid' as const,
    gap: '12px',
    marginBottom: '12px',
  },
  notice: {
    margin: '0 0 20px',
    padding: '12px 16px',
    borderRadius: '10px',
    fontSize: '14px',
    lineHeight: 1.5,
    backgroundColor: 'var(--chip-bg)',
    border: '1px solid var(--chip-border)',
    color: 'var(--text-primary)',
  },
  retry: {
    border: 0,
    background: 'none',
    padding: 0,
    font: 'inherit',
    color: 'var(--accent)',
    fontWeight: 600 as const,
    textDecoration: 'underline' as const,
    cursor: 'pointer',
  },
  thinNote: {
    margin: '0 0 12px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
  },
  decks: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    marginBottom: '50px',
    transition: 'opacity 0.15s ease',
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
  needsTag: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '760px',
    margin: '0 auto',
  },
  ghost: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '12px',
    opacity: 0.55,
    maskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 92%)',
    pointerEvents: 'none' as const,
  },
  ghostDeck: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    padding: '10px 12px 12px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  ghostHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  ghostLine: {
    display: 'block' as const,
    width: '35%',
    height: '10px',
    borderRadius: '5px',
    backgroundColor: 'var(--skeleton-base)',
  },
  ghostWinChance: {
    color: 'var(--accent)',
    fontWeight: 800 as const,
    fontSize: '15px',
  },
  ghostCards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, 1fr)',
  },
  ghostCard: {
    aspectRatio: '0.82',
    borderRadius: '7px',
    backgroundColor: 'var(--skeleton-base)',
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
    color: 'var(--accent)',
    backgroundColor: 'var(--accent-a20)',
  },
  needsTagText: {
    margin: '0 0 4px',
    color: 'var(--text-secondary)',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  needsTagButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    marginTop: '16px',
    padding: '11px 22px',
    borderRadius: '10px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
};
