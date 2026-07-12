import { useRef, useState, type ReactNode } from 'react';

interface InfoTipProps {
  ariaLabel: string;
  color?: string;
  width?: number;
  placement?: 'top' | 'bottom';
  align?: 'center' | 'right';
  interactive?: boolean;
  children: ReactNode;
}

export default function InfoTip({
  ariaLabel,
  color,
  width = 220,
  placement = 'top',
  align = 'center',
  interactive = false,
  children,
}: InfoTipProps) {
  const [show, setShow] = useState(false);
  const lastPointerType = useRef('');
  return (
    <span
      style={{ ...styles.icon, color }}
      onPointerDown={(e) => { lastPointerType.current = e.pointerType; }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setShow(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setShow(false); }}
      tabIndex={0}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) setShow(true); }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setShow(false);
      }}
      onClick={() => { if (lastPointerType.current !== 'mouse') setShow((prev) => !prev); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setShow(false);
      }}
      role="img"
      aria-label={ariaLabel}
    >
      <InfoMark />
      {show && (
        <span
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...styles.tooltip,
            width: `${width}px`,
            ...(placement === 'bottom'
              ? { top: 'calc(100% + 8px)', bottom: 'auto' }
              : {}),
            ...(align === 'right'
              ? { left: 'auto', right: '-4px', transform: 'none' }
              : {}),
            ...(interactive ? { pointerEvents: 'auto' as const } : {}),
          }}
        >
          {children}
        </span>
      )}
    </span>
  );
}

function InfoMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style={{ display: 'block' }}>
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="8" cy="4.6" r="1.05" />
      <rect x="7.1" y="6.9" width="1.8" height="5.2" rx="0.9" />
    </svg>
  );
}

const styles = {
  icon: {
    position: 'relative' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '14px',
    height: '14px',
    cursor: 'help',
    lineHeight: 1,
    flexShrink: 0,
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: 'calc(100% + 8px)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--tooltip-border)',
    backgroundColor: 'var(--tooltip-bg)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    textTransform: 'none' as const,
    letterSpacing: 'normal' as const,
    lineHeight: 1.4,
    textAlign: 'left' as const,
    whiteSpace: 'normal' as const,
    zIndex: 10,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none' as const,
  },
};
