import { useState } from 'react';

interface UseInBuilderButtonProps {
  onClick: () => void;
  busy: boolean;
  spinning: boolean;
  accent: string;
  variant: 'circle' | 'full';
}

export default function UseInBuilderButton({ onClick, busy, spinning, accent, variant }: UseInBuilderButtonProps) {
  const [hovered, setHovered] = useState(false);

  const shared = {
    border: `1px solid ${accent}`,
    backgroundColor: 'var(--float-btn-bg)',
    color: accent,
    cursor: busy ? ('wait' as const) : ('pointer' as const),
    opacity: busy ? 0.6 : 1,
  };

  if (variant === 'full') {
    return (
      <button className="mobile-touch-target" onClick={onClick} disabled={busy} style={{ ...styles.full, ...shared }}>
        <ArrowIcon size={16} spinning={spinning} />
        Use War Deck Set in Builder
      </button>
    );
  }

  return (
    <div style={styles.circleWrap}>
      <button
        onClick={onClick}
        disabled={busy}
        aria-label="Use War Deck Set in Builder"
        className="deck-swap-btn mobile-touch-target"
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHovered(true); }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHovered(false); }}
        style={{ ...styles.circle, ...shared }}
      >
        <ArrowIcon size={20} spinning={spinning} />
      </button>
      {hovered && !busy && (
        <div style={styles.tooltip}>
          Use War Deck Set in Builder
        </div>
      )}
    </div>
  );
}

function ArrowIcon({ size, spinning }: { size: number; spinning: boolean }) {
  if (spinning) {
    return (
      <svg viewBox="0 0 24 24" style={{ width: size, height: size, display: 'block', animation: 'spin 1s linear infinite' }} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 512 512" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <path fill="currentColor" d="M217.9 105.9L340.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L217.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1L32 320c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM352 416l64 0c17.7 0 32-14.3 32-32l0-256c0-17.7-14.3-32-32-32l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64 0c53 0 96 43 96 96l0 256c0 53-43 96-96 96l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32z" />
    </svg>
  );
}

const styles = {
  full: {
    width: '100%',
    marginTop: '12px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    padding: '11px',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700 as const,
  },
  circleWrap: {
    position: 'relative' as const,
  },
  circle: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 0,
    boxShadow: '0 3px 10px rgba(13, 27, 62, 0.18)',
  },
  tooltip: {
    position: 'absolute' as const,
    right: 'calc(100% + 10px)',
    top: '50%',
    transform: 'translateY(-50%)',
    whiteSpace: 'nowrap' as const,
    backgroundColor: 'var(--tooltip-bg)',
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 600 as const,
    padding: '6px 10px',
    borderRadius: '6px',
    pointerEvents: 'none' as const,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    zIndex: 10,
  },
};
