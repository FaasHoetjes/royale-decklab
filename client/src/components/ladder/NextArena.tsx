import { arenaFor, nextArena } from '../../lib/ladder';
import PlaceArt from './PlaceArt';

/** How far the player is through their arena, toward the next one. */
export default function NextArena({ trophies }: { trophies: number }) {
  const current = arenaFor(trophies);
  const next = nextArena(trophies);
  if (!next) return null;
  const done = Math.min(1, Math.max(0, (trophies - current.floor) / (next.floor - current.floor)));
  const left = next.floor - trophies;

  return (
    <div style={styles.box}>
      <div style={{ minWidth: 0 }}>
        <div style={styles.text}>
          <b style={styles.value}>{left.toLocaleString()} trophies</b> to {next.name}
        </div>
        <div
          role="progressbar"
          aria-label={`Progress to ${next.name}`}
          aria-valuemin={current.floor}
          aria-valuemax={next.floor}
          aria-valuenow={trophies}
          style={styles.track}
        >
          <div style={{ ...styles.fill, width: `${done * 100}%` }} />
        </div>
      </div>
      <PlaceArt place={next} style={styles.art} />
    </div>
  );
}

const styles = {
  box: {
    display: 'grid' as const,
    gridTemplateColumns: 'minmax(0, 1fr) 54px',
    gap: '12px',
    alignItems: 'center' as const,
    padding: '12px 14px',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  text: {
    fontSize: '14px',
    color: 'var(--text-secondary)',
  },
  value: {
    color: 'var(--text-primary)',
  },
  track: {
    height: '8px',
    marginTop: '7px',
    borderRadius: '6px',
    overflow: 'hidden' as const,
    backgroundColor: 'var(--bg-tertiary)',
  },
  fill: {
    height: '100%',
    borderRadius: '6px',
    background: 'linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, #fff))',
    transition: 'width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  art: {
    width: '54px',
    height: '48px',
  },
};
