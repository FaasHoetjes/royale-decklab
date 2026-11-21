import { useEffect, useState, type CSSProperties } from 'react';
import type { LadderPlace } from '../../lib/ladder';

interface PlaceArtProps {
  place: LadderPlace;
  className?: string;
  style?: CSSProperties;
  priority?: boolean;
}

/** An arena or league shield, or its name in a tile when the art is missing. */
export default function PlaceArt({ place, className, style, priority }: PlaceArtProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [place.art]);

  if (broken) {
    return (
      <div className={className} style={{ ...styles.missing, ...style }} aria-label={place.name} role="img">
        {place.name}
      </div>
    );
  }
  return (
    <img
      src={place.art}
      alt={place.name}
      className={className}
      style={{ ...styles.image, ...style }}
      loading={priority ? undefined : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      onError={() => setBroken(true)}
    />
  );
}

const styles = {
  image: {
    display: 'block',
    objectFit: 'contain' as const,
  },
  missing: {
    display: 'grid' as const,
    placeItems: 'center' as const,
    textAlign: 'center' as const,
    padding: '4px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 700 as const,
    lineHeight: 1.2,
    color: 'var(--text-secondary)',
    background: 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 22%, var(--bg-tertiary)), var(--bg-tertiary))',
    border: '1px dashed var(--border-strong)',
  },
};
