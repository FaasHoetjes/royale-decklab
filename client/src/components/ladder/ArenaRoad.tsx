import type { LadderModeId, LadderResponse } from '../../api';
import { ARENAS, LEAGUES, RANGE_WIDTH, rangeOf, type LadderPlace } from '../../lib/ladder';
import PlaceArt from './PlaceArt';

interface ArenaRoadProps {
  mode: LadderModeId;
  place: LadderPlace;
  rangeFloor: number;
  ranges: LadderResponse['ranges'];
}

const ARENAS_EITHER_SIDE = 4;

/** The arenas around the player's, or every league, with the games collected in each and the player marked. */
export default function ArenaRoad({ mode, place, rangeFloor, ranges }: ArenaRoadProps) {
  const ranked = mode === 'ranked';
  const all = ranked ? LEAGUES : ARENAS;
  const at = all.findIndex((p) => p.number === place.number);
  const shown = ranked ? all : all.slice(Math.max(0, at - ARENAS_EITHER_SIDE), at + ARENAS_EITHER_SIDE + 1);
  const battles = new Map(ranges.map((r) => [r.floor, r.battles]));
  const most = Math.max(1, ...ranges.map((r) => r.battles));
  const step = ranked ? 1 : RANGE_WIDTH;

  return (
    <section aria-labelledby="ladder-road-title">
      <h3 id="ladder-road-title" style={styles.title}>{ranked ? 'Ranked leagues' : 'Trophy Road arenas'}</h3>
      <ol style={styles.road}>
        {[...shown].reverse().map((stop) => {
          const range = rangeOf(mode, stop);
          const own = stop.number === place.number;
          const borrowed = !own && Math.abs(range - rangeFloor) <= step;
          const games = battles.get(range) ?? 0;
          return (
            <li
              key={stop.number}
              aria-current={own ? 'step' : undefined}
              style={{ ...styles.stop, ...(own ? styles.ownStop : {}) }}
            >
              <PlaceArt
                place={stop}
                className={own ? 'ladder-float' : undefined}
                style={{ ...styles.art, filter: own ? 'none' : borrowed ? 'grayscale(0.3) brightness(0.9)' : 'grayscale(0.85) brightness(0.7)' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={styles.name}>
                  {stop.name}
                  {own && <span style={styles.you}>You</span>}
                </div>
                <div style={styles.sub}>
                  {ranked ? `League ${stop.number}` : `${stop.floor.toLocaleString()}+ trophies`} · {games.toLocaleString()} games
                </div>
                <div
                  aria-hidden="true"
                  style={{
                    ...styles.bar,
                    width: `${Math.max(4, (games / most) * 100)}%`,
                    background: own || range === rangeFloor ? 'var(--accent)' : borrowed ? 'color-mix(in srgb, var(--accent) 50%, var(--border-strong))' : 'var(--border-strong)',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ol>
      <p style={styles.legend}>
        Games collected in each {ranked ? 'league' : 'range of 1,000 trophies'}. The decks come from yours, and lean on the
        ones next to it, which count for less.
      </p>
    </section>
  );
}

const styles = {
  title: {
    margin: '0 0 10px',
    fontSize: '15px',
    color: 'var(--text-primary)',
  },
  road: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid' as const,
    gap: '4px',
  },
  stop: {
    display: 'grid' as const,
    gridTemplateColumns: '56px minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'center' as const,
    padding: '4px 8px 4px 4px',
    borderRadius: '12px',
  },
  ownStop: {
    background: 'var(--accent-a20)',
    boxShadow: 'inset 0 0 0 1px var(--accent)',
  },
  art: {
    width: '56px',
    height: '50px',
  },
  name: {
    fontSize: '13px',
    fontWeight: 700 as const,
    lineHeight: 1.25,
    color: 'var(--text-primary)',
  },
  you: {
    marginLeft: '6px',
    padding: '1px 7px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800 as const,
    verticalAlign: '1px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
  },
  sub: {
    fontSize: '11.5px',
    color: 'var(--text-tertiary)',
  },
  bar: {
    height: '5px',
    borderRadius: '3px',
    marginTop: '4px',
    transition: 'width 0.6s ease',
  },
  legend: {
    margin: '10px 0 0',
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
};
