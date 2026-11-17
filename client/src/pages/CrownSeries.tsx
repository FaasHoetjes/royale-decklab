import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useCrownSeriesDecks } from '../queries';
import { isNoDuelData, type CrownSeriesLeagueId } from '../api';
import { leagueFor, saveLeague } from '../lib/crownSeries';
import { displayLevel } from '../lib/cardDisplay';
import CrownSeriesBanner from '../components/CrownSeriesBanner';
import LeaguePicker from '../components/LeaguePicker';
import DeckCard from '../components/DeckCard';
import LoadError from '../components/LoadError';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import { SearchIcon } from '../components/navIcons';

export default function CrownSeries() {
  const { activePlayerTag } = useApp();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const league = leagueFor(searchParams.get('league'));

  const duelDecks = useCrownSeriesDecks(activePlayerTag, league.id);
  const data = duelDecks.data;
  const decks = data?.duelDecks.decks ?? [];
  const isUpdating = duelDecks.isPlaceholderData;

  const pickLeague = (id: CrownSeriesLeagueId) => {
    saveLeague(id);
    const params = new URLSearchParams(searchParams);
    params.set('league', id);
    setSearchParams(params, { replace: true });
  };

  const header = (
    <div style={{ marginBottom: isMobile ? '16px' : '24px' }}>
      <h1 className={isMobile ? 'visually-hidden' : undefined} style={styles.title}>Crown Series Duel Deck</h1>
      <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined }}>
        Your best 4 decks for a Crown Series Duel, with your cards at the levels your league plays them at.
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
    <div style={styles.controls}>
      <LeaguePicker league={league} onPick={pickLeague} />
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

  const shownRounds = decks.reduce((sum, d) => sum + d.uses, 0);
  const leagueShare = shownRounds === 0 ? 1 : decks.reduce((sum, d) => sum + (d.leagueUses ?? 0), 0) / shownRounds;
  const averageWinChance = decks.length === 0 ? 0 : data.duelDecks.totalScore / decks.length;
  const belowCap = decks.flatMap((d) => d.cards).filter((c) => displayLevel(c.level, c.maxLevel) < data.levelCap).length;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0' : '20px 0' }}>
      {header}
      <CrownSeriesBanner
        league={league}
        playerName={data.player.name}
        decks={decks}
        total={{ value: `${Math.round(averageWinChance * 100)}%`, label: 'win chance per round' }}
        scoreTip={
          <>
            <strong>Your average chance to win a round.</strong>
            <br />
            You bring all 4 decks and play 2 or 3 of them in a best of 3, so this averages their win chances. Each starts from the deck's win rate in Crown Series Duels:{' '}
            {data.duelRounds.toLocaleString()} rounds played at level {data.levelCap}, and{' '}
            {(data.allDuelRounds - data.duelRounds).toLocaleString()} from other leagues, which count for less. Then it
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
            leagueUses={deck.leagueUses}
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

// Below this share of their rounds played in the league itself, the picks mostly reflect other leagues.
const MIN_LEAGUE_SHARE = 0.5;

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
  thinNote: {
    margin: '0 0 12px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
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
