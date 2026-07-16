import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { slotKind, slotBorderStyle, CARD_FRAME } from '../lib/slotStyles';
import ElixirBadge from './ElixirBadge';

interface CardTileProps {
  name: string;
  iconUrl?: string;
  /** The first three positions get the evo/hero/both frame. */
  slotIndex?: number;
  elixirCost?: number;
  level?: number | null;
  showName?: boolean;
  nameColor?: string;
  lazyLoad?: boolean;
  fetchPriority?: 'high' | 'low' | 'auto';
  artStyle?: CSSProperties;
  children?: ReactNode;
}

export default function CardTile({
  name,
  iconUrl,
  slotIndex,
  elixirCost,
  level,
  showName = true,
  nameColor,
  lazyLoad,
  fetchPriority,
  artStyle,
  children,
}: CardTileProps) {
  const kind = slotIndex != null ? slotKind(slotIndex) : null;

  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);
  const showImage = !!iconUrl && !broken;

  return (
    <>
      <div
        style={{
          ...styles.art,
          ...(kind ? slotBorderStyle(kind) : CARD_FRAME),
          ...artStyle,
        }}
      >
        {showImage ? (
          <img
            src={iconUrl}
            alt={name}
            loading={lazyLoad ? 'lazy' : undefined}
            decoding={lazyLoad ? 'async' : undefined}
            fetchPriority={fetchPriority}
            style={styles.image}
            onError={() => setBroken(true)}
          />
        ) : (
          <div style={styles.placeholder} aria-hidden="true">
            {placeholderInitials(name)}
          </div>
        )}
        {elixirCost != null && <ElixirBadge cost={elixirCost} />}
        {level != null && <div style={styles.level}>LEVEL {level}</div>}
        {children}
      </div>
      {showName && <div style={{ ...styles.name, color: nameColor }}>{name}</div>}
    </>
  );
}

function placeholderInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

const styles = {
  art: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    containerType: 'inline-size' as const,
  },
  placeholder: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: '32cqw',
    fontWeight: 800 as const,
    letterSpacing: '1px',
    color: 'rgba(255, 255, 255, 0.45)',
  },
  image: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  level: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75), transparent)',
    color: 'white',
    fontSize: '11px',
    fontWeight: 800 as const,
    letterSpacing: '0.5px',
    textAlign: 'center' as const,
    padding: '12px 0 4px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.9)',
  },
  name: {
    fontSize: 'var(--card-name-font-size)',
    fontWeight: 600 as const,
    textAlign: 'center' as const,
    marginTop: '5px',
    lineHeight: 1.1,
    minHeight: '12px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
};
