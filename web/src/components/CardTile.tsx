// Shared card visual, extracted from DeckCard's card rendering (the 0.82
// aspect-ratio box with the elixir SVG drop and image-over-gradient). Used by
// the Mega Draft grid, deck trays and results. Stateless and presentational.

interface CardTileProps {
  name: string;
  elixir?: number;
  iconUrl?: string;
  /** Dim the tile (e.g. a card already drafted). */
  dimmed?: boolean;
  /** Small corner badge, e.g. "P"/"C" for who drafted it. */
  badge?: string;
  badgeColor?: string;
  /** Selectable styling (pointer + hover lift) for the player's turn. */
  selectable?: boolean;
  /** Floating "+N" points preview shown on hover. */
  pointsPreview?: number | null;
  /** Highlight ring (e.g. the most recent pick). */
  highlight?: boolean;
  onClick?: () => void;
  onHoverChange?: (hovering: boolean) => void;
}

export default function CardTile({
  name,
  elixir,
  iconUrl,
  dimmed,
  badge,
  badgeColor = '#007bff',
  selectable,
  pointsPreview,
  highlight,
  onClick,
  onHoverChange,
}: CardTileProps) {
  return (
    <div
      style={{ ...styles.wrap, cursor: selectable ? 'pointer' : 'default' }}
      onClick={selectable ? onClick : undefined}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      title={`${name}${elixir != null ? ` · ${elixir} elixir` : ''}`}
    >
      <div
        className={selectable ? 'cardtile-selectable' : undefined}
        style={{
          ...styles.card,
          opacity: dimmed ? 0.32 : 1,
          filter: dimmed ? 'grayscale(0.6)' : 'none',
          ...(highlight ? styles.highlight : {}),
        }}
      >
        {iconUrl ? (
          <img src={iconUrl} alt={name} style={styles.image} />
        ) : (
          <span style={styles.fallbackName}>{name}</span>
        )}

        {elixir != null && (
          <div style={styles.elixir}>
            <svg viewBox="0 0 28 30" style={styles.elixirDrop} aria-hidden="true">
              <defs>
                <radialGradient id="tileElixirGrad" cx="36%" cy="62%" r="70%">
                  <stop offset="0%" stopColor="#f6a8ff" />
                  <stop offset="45%" stopColor="#d63bd6" />
                  <stop offset="100%" stopColor="#a0149e" />
                </radialGradient>
              </defs>
              <path
                d="M24 5 Q24 18 22.8 24.9 A12 12 0 0 1 1.7 13.9 Q6 6 24 5 Z"
                fill="url(#tileElixirGrad)"
                stroke="#000000"
                strokeWidth="1.6"
              />
              <ellipse cx="9" cy="14" rx="2.4" ry="3.4" fill="rgba(255,255,255,0.55)" transform="rotate(-20 9 14)" />
            </svg>
            <span style={styles.elixirText}>{elixir}</span>
          </div>
        )}

        {badge && (
          <div style={{ ...styles.badge, backgroundColor: badgeColor }}>{badge}</div>
        )}

        {pointsPreview != null && (
          <div style={styles.pointsPreview}>+{pointsPreview}</div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'block',
  },
  card: {
    position: 'relative' as const,
    aspectRatio: '0.82',
    borderRadius: '10px',
    overflow: 'hidden' as const,
    border: '2px solid rgba(0, 0, 0, 0.15)',
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
    background: 'linear-gradient(160deg, #2a3a6a 0%, #16213f 100%)',
    transition: 'transform 0.12s ease, box-shadow 0.12s ease',
  },
  highlight: {
    boxShadow: '0 0 0 3px #ffcc00, 0 3px 10px rgba(0,0,0,0.35)',
  },
  image: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
  },
  fallbackName: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '4px',
    textAlign: 'center' as const,
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 700 as const,
  },
  elixir: {
    position: 'absolute' as const,
    top: '3px',
    left: '3px',
    width: '23px',
    height: '25px',
    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5))',
  },
  elixirDrop: {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
  },
  elixirText: {
    position: 'absolute' as const,
    left: 0,
    right: '8%',
    top: '60%',
    transform: 'translateY(-50%)',
    textAlign: 'center' as const,
    color: 'white',
    fontWeight: 'bold' as const,
    fontSize: '11px',
    textShadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
  },
  badge: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 800 as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
  },
  pointsPreview: {
    position: 'absolute' as const,
    bottom: '4px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.78)',
    color: '#7CFC8A',
    fontSize: '13px',
    fontWeight: 800 as const,
    padding: '2px 8px',
    borderRadius: '999px',
    pointerEvents: 'none' as const,
  },
};
