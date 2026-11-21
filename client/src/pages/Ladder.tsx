import { useSearchParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { useLadderDecks } from '../queries';
import { isNoLadderData, type LadderModeId, type LadderResponse } from '../api';
import { distinctDeckNames } from '../lib/archetypes';
import { LOWEST_RANGE, RANGE_WIDTH, placeOf } from '../lib/ladder';
import NeedsTag from '../components/NeedsTag';
import LoadError from '../components/LoadError';
import { WarDecksSkeleton } from '../components/LoadingSkeletons';
import LadderModeTiles from '../components/ladder/LadderModeTiles';
import LadderStage from '../components/ladder/LadderStage';
import LadderAlternative from '../components/ladder/LadderAlternative';
import ArenaRoad from '../components/ladder/ArenaRoad';
import NextArena from '../components/ladder/NextArena';

const ALTERNATIVES_SHOWN = 3;

const modeFor = (value: string | null): LadderModeId => (value === 'ranked' ? 'ranked' : 'trophy-road');

export default function Ladder() {
  const { activePlayerTag } = useApp();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = modeFor(searchParams.get('mode'));

  const ladderDecks = useLadderDecks(activePlayerTag, mode);
  const data = ladderDecks.data;
  const isUpdating = ladderDecks.isPlaceholderData;

  const pickMode = (picked: LadderModeId) => {
    const params = new URLSearchParams(searchParams);
    params.set('mode', picked);
    setSearchParams(params, { replace: true });
  };

  const header = (
    <div style={{ marginBottom: isMobile ? '16px' : '20px' }}>
      <h1 className={isMobile ? 'visually-hidden' : undefined} style={styles.title}>Ladder Deck Generator</h1>
      <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined }}>
        Your best deck for Trophy Road or Ranked, from the cards you own and the decks winning where you play.
      </p>
    </div>
  );

  if (!activePlayerTag) {
    return (
      <div className="fills-page" style={{ ...styles.container, ...styles.fillContainer, padding: isMobile ? '4px 0' : '20px 0' }}>
        {header}
        <div style={styles.centered}>
          <NeedsTag
            isMobile={isMobile}
            returnTo="/ladder"
            text="Ladder decks are built from your card collection. Search your player tag first."
            icon={<path d="M7 2v20M17 2v20M7 6h10M7 12h10M7 18h10" />}
          />
        </div>
      </div>
    );
  }

  const trophies = data?.trophies;
  const controls = (
    <div style={{ marginBottom: isMobile ? '14px' : '18px' }}>
      <LadderModeTiles
        value={mode}
        onPick={pickMode}
        detail={{
          'trophy-road': trophies != null ? `${trophies.toLocaleString()} trophies` : undefined,
          ranked: data?.mode === 'ranked' ? placeOf('ranked', 0, data.rangeFloor).name : undefined,
        }}
      />
    </div>
  );

  if (ladderDecks.isError && !data) {
    const noData = isNoLadderData(ladderDecks.error);
    return (
      <div style={styles.container}>
        {header}
        {controls}
        <LoadError
          title={noData ? 'No ladder games collected yet' : "Couldn't build your ladder deck"}
          message={noData
            ? 'Decks are ranked on the Trophy Road and Ranked games players around your trophies play. Check back in an hour.'
            : 'Something went wrong loading your deck. Please try again in a moment.'}
          onRetry={() => ladderDecks.refetch()}
          retrying={ladderDecks.isFetching}
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

  const [best] = data.ladderDecks.decks;
  const alternatives = data.ladderDecks.alternatives.slice(0, ALTERNATIVES_SHOWN);
  const names = distinctDeckNames([...(best ? [best] : []), ...alternatives].map((d) => d.cards));
  const place = placeOf(data.mode, data.trophies, data.rangeFloor);
  const altNames = best ? names.slice(1) : names;

  const road = <ArenaRoad mode={data.mode} place={place} rangeFloor={data.rangeFloor} ranges={data.ranges} />;
  const rest = (
    <div style={styles.restColumn}>
      {data.mode === 'trophy-road' && <NextArena trophies={data.trophies} />}
      <p style={styles.note} role="note">{rangeNote(data)}</p>
      {alternatives.length > 0 && (
        <section aria-labelledby="ladder-alternatives" style={styles.alternatives}>
          <h2 id="ladder-alternatives" style={styles.sectionTitle}>Also strong for you</h2>
          {alternatives.map((deck, i) => (
            <LadderAlternative key={deck.cardIds.join(',')} deck={deck} name={altNames[i] ?? ''} isMobile={isMobile} />
          ))}
        </section>
      )}
    </div>
  );

  return (
    <div style={{ ...styles.container, padding: isMobile ? '8px 0 40px' : '20px 0 50px' }}>
      {header}
      {controls}
      <div style={{ opacity: isUpdating ? 0.55 : 1, transition: 'opacity 0.15s ease' }} aria-busy={isUpdating}>
        {best ? (
          <LadderStage
            key={`${data.mode}|${best.cardIds.join(',')}`}
            deck={best}
            name={names[0] ?? ''}
            place={place}
            where={whereText(data, place.name, place.number)}
            rangeLevel={data.rangeLevel}
            isMobile={isMobile}
          />
        ) : (
          <p style={styles.note}>None of the decks played in your range can be built from your cards yet.</p>
        )}
        <div style={{ ...styles.below, gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '250px minmax(0, 1fr)' }}>
          {isMobile ? <>{rest}{road}</> : <>{road}{rest}</>}
        </div>
      </div>
    </div>
  );
}

function whereText(data: LadderResponse, placeName: string, arenaNumber: number): string {
  if (data.mode === 'ranked') return `Ranked · ${placeName}`;
  return `Arena ${arenaNumber} · ${placeName} · ${data.trophies.toLocaleString()} trophies`;
}

/** Where the picks come from, and why when it isn't the player's own range. */
function rangeNote(data: LadderResponse): string {
  const games = `${data.rangeBattles.toLocaleString()} games`;
  if (data.mode === 'ranked') {
    return data.ownRange
      ? `Built from ${games} in your Ranked league.`
      : `No games in your Ranked league collected yet, so these picks come from league ${data.rangeFloor}.`;
  }
  const range = `${data.rangeFloor.toLocaleString()} to ${(data.rangeFloor + RANGE_WIDTH - 1).toLocaleString()} trophies`;
  if (!data.ownRange) return `Few games at your trophies collected yet, so these picks come from ${range}.`;
  if (data.trophies < LOWEST_RANGE) return `Below ${LOWEST_RANGE.toLocaleString()} trophies, the picks come from ${range}: ${games}.`;
  return `Built from ${games} at ${range}.`;
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
  below: {
    display: 'grid' as const,
    gap: '24px',
    alignItems: 'start' as const,
    marginTop: '22px',
  },
  restColumn: {
    display: 'grid' as const,
    gap: '14px',
    minWidth: 0,
  },
  note: {
    margin: 0,
    color: 'var(--text-secondary)',
    fontSize: '14px',
  },
  alternatives: {
    display: 'grid' as const,
    gap: '10px',
  },
  sectionTitle: {
    color: 'var(--text-primary)',
    fontSize: '17px',
    margin: '4px 0 2px',
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
};
