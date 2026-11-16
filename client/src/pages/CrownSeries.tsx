import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useCrownSeriesDecks } from '../queries';
import { isNoDuelData, type CrownSeriesLeagueId } from '../api';
import { DUEL_DECK_SIZES, LEAGUES, deckSizeOf, leagueFor, leagueOf, saveLeague, type DuelDeckSize } from '../lib/crownSeries';
import { displayLevel } from '../lib/cardDisplay';
import GeneratorHeader from '../components/GeneratorHeader';
import DeckCard from '../components/DeckCard';
import LoadError from '../components/LoadError';
import { Segment } from '../components/generator/SegmentedChoice';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import { SearchIcon } from '../components/navIcons';

export default function CrownSeries() {
  const { activePlayerTag } = useApp();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const league = leagueFor(searchParams.get('league'));
  const deckCount = deckSizeOf(searchParams.get('decks'));

  const duelDecks = useCrownSeriesDecks(activePlayerTag, league.id, deckCount);
  const data = duelDecks.data;
  const decks = data?.duelDecks.decks ?? [];
  const isUpdating = duelDecks.isPlaceholderData;

  const show = (next: { league?: CrownSeriesLeagueId; decks?: DuelDeckSize }) => {
    const params = new URLSearchParams(searchParams);
    if (next.league) {
      saveLeague(next.league);
      params.set('league', next.league);
    }
    if (next.decks) params.set('decks', String(next.decks));
    setSearchParams(params, { replace: true });
  };

  const header = (
    <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
      <h1 className={isMobile ? 'visually-hidden' : undefined} style={styles.title}>Crown Series Duel Deck</h1>
      <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined }}>
        Your best {deckCount} decks for a Crown Series Duel, with your cards at the levels your league plays them at.
      </p>
    </div>
  );

  if (!activePlayerTag) {
    return (
      <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
        {header}
        <div style={styles.needsTag}>
          <p style={styles.needsTagText}>Duel Decks are built from your card collection. Search your player tag first.</p>
          <Link to="/" state={{ returnTo: '/crown-series' }} style={styles.needsTagButton}>
            <SearchIcon />
            Search your player tag
          </Link>
        </div>
      </div>
    );
  }

  const controls = (
    <div style={{ ...styles.controls, gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 120px' }}>
      <label style={styles.control}>
        <span style={styles.controlLabel}>League</span>
        <select
          value={league.id}
          onChange={(e) => show({ league: leagueOf(e.target.value)?.id })}
          style={styles.select}
        >
          {LEAGUES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} League · cards up to level {l.levelCap}
            </option>
          ))}
        </select>
      </label>
      <div style={styles.control}>
        <span style={styles.controlLabel}>Decks</span>
        <Segment label="Number of decks" choices={[...DUEL_DECK_SIZES]} value={deckCount} onPick={(n) => show({ decks: n })} text={String} />
      </div>
    </div>
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

  const belowCap = decks.flatMap((d) => d.cards).filter((c) => displayLevel(c.level, c.maxLevel) < data.levelCap).length;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '20px 0' }}>
      {header}
      <GeneratorHeader
        title={data.player.name}
        eyebrow={`Crown Series · ${league.name} League`}
        decks={decks}
        totalScore={data.duelDecks.totalScore}
        total={{ value: `${data.duelDecks.totalScore.toFixed(1)} of ${decks.length}`, label: 'expected round wins' }}
        scoreTip={
          <>
            <strong>Rounds you'd win playing each deck once.</strong>
            <br />
            The sum of your decks' win chances. Each starts from the deck's win rate in{' '}
            {data.duelRounds.toLocaleString()} Crown Series Duel rounds, then factors in your card levels at the league's
            cap. Your opponents have about your levels, so a card below the cap costs a lot.
          </>
        }
        isMobile={isMobile}
      />
      {controls}
      {belowCap > 0 && (
        <p style={styles.notice} role="note">
          {belowCap} of these cards {belowCap === 1 ? 'is' : 'are'} below level {data.levelCap}, the cap in your league.
          Upgrading {belowCap === 1 ? 'it' : 'them'} helps more than anything else.
        </p>
      )}
      <div style={{ ...styles.decks, gap: isMobile ? '16px' : '30px', opacity: isUpdating ? 0.55 : 1 }} aria-busy={isUpdating}>
        {decks.map((deck, i) => (
          <DeckCard
            key={deck.cardIds.join(',')}
            cards={deck.cards}
            metaWinRate={deck.metaWinRate}
            uses={deck.uses}
            players={deck.players}
            pickRate={deck.pickRate}
            cardVersions={deck.cardVersions}
            metaCardVersions={deck.metaCardVersions}
            playerScore={deck.playerScore}
            deckNumber={i + 1}
            priority={i === 0}
            source="duel"
            levelCap={data.levelCap}
          />
        ))}
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
    marginBottom: '20px',
  },
  control: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
    minWidth: 0,
  },
  controlLabel: {
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  select: {
    height: '44px',
    padding: '0 12px',
    borderRadius: '11px',
    border: '1px solid var(--border-strong)',
    backgroundColor: 'var(--control-bg)',
    color: 'var(--control-text)',
    fontSize: '15px',
    fontWeight: 600 as const,
    minWidth: 0,
  },
  notice: {
    margin: '0 0 20px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid color-mix(in srgb, var(--down) 35%, transparent)',
    backgroundColor: 'color-mix(in srgb, var(--down) 8%, var(--bg-secondary))',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  decks: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr',
    marginBottom: '50px',
    transition: 'opacity 0.15s ease',
  },
  needsTag: {
    maxWidth: '400px',
    margin: '40px auto',
    padding: '26px 22px 22px',
    textAlign: 'center' as const,
    backgroundColor: 'var(--bg-elevated)',
    border: '1px solid var(--panel-border)',
    borderRadius: '18px',
  },
  needsTagText: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: '15px',
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
