import type { CSSProperties, ReactNode } from 'react';
import { slotKind, slotBorderStyle, cardFrame } from '../lib/slotStyles';
import ElixirBadge from './ElixirBadge';

interface CardTileProps {
  name: string;
  iconUrl?: string;
  isDarkMode: boolean;
  /** Positional index; the first three positions get the evo/hero/both frame. */
  slotIndex?: number;
  elixirCost?: number;
  /** Unified /16 level; omit to hide the level banner. */
  level?: number | null;
  showName?: boolean;
  nameColor?: string;
  lazyLoad?: boolean;
  /** Extra overrides on the art box (e.g. drag drop-target outline). */
  artStyle?: CSSProperties;
  /** Extra overlays inside the art box (e.g. the builder's version toggle). */
  children?: ReactNode;
}

/** One card: framed art with elixir/level overlays, optionally named below. */
export default function CardTile({
  name,
  iconUrl,
  isDarkMode,
  slotIndex,
  elixirCost,
  level,
  showName = true,
  nameColor,
  lazyLoad,
  artStyle,
  children,
}: CardTileProps) {
  const kind = slotIndex != null ? slotKind(slotIndex) : null;
  return (
    <>
      <div
        style={{
          ...styles.art,
          ...(kind ? slotBorderStyle(kind, isDarkMode) : cardFrame(isDarkMode)),
          ...artStyle,
        }}
      >
        {iconUrl && (
          <img
            src={iconUrl}
            alt={name}
            loading={lazyLoad ? 'lazy' : undefined}
            decoding={lazyLoad ? 'async' : undefined}
            style={styles.image}
          />
        )}
        {elixirCost != null && <ElixirBadge cost={elixirCost} />}
        {level != null && <div style={styles.level}>LEVEL {level}</div>}
        {children}
      </div>
      {showName && <div style={{ ...styles.name, color: nameColor }}>{name}</div>}
    </>
  );
}

const styles = {
  art: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
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
    fontSize: '10px',
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
