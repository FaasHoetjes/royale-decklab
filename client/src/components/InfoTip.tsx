import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const lastPointerType = useRef('');
  const hideTimer = useRef<number | null>(null);

  const cancelHide = () => {
    if (hideTimer.current != null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  // Interactive tooltips hold a link, so give the pointer a moment to bridge the
  // gap between the icon and the tooltip before hiding.
  const startHide = () => {
    if (!interactive) {
      setShow(false);
      return;
    }
    cancelHide();
    hideTimer.current = window.setTimeout(() => setShow(false), 160);
  };
  useEffect(() => () => cancelHide(), []);

  // The tooltip is rendered on <body> with fixed positioning, so no card, banner or stacking context
  // can cover or clip it. It follows the icon while the page scrolls or resizes.
  useLayoutEffect(() => {
    if (!show) {
      setPosition(null);
      return;
    }
    const place = () => {
      const icon = iconRef.current?.getBoundingClientRect();
      if (!icon) return;
      const margin = 8;
      const tipWidth = Math.min(width, window.innerWidth - margin * 2);
      const preferred = align === 'right' ? icon.right + 4 - tipWidth : icon.left + icon.width / 2 - tipWidth / 2;
      const left = Math.max(margin, Math.min(preferred, window.innerWidth - tipWidth - margin));
      setPosition({
        left: `${left}px`,
        width: `${tipWidth}px`,
        ...(placement === 'bottom'
          ? { top: `${icon.bottom + 8}px` }
          : { bottom: `${window.innerHeight - icon.top + 8}px` }),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [show, width, placement, align]);

  return (
    <span
      ref={iconRef}
      className="mobile-touch-hitbox"
      style={{ ...styles.icon, color }}
      onPointerDown={(e) => { lastPointerType.current = e.pointerType; }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') { cancelHide(); setShow(true); } }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') startHide(); }}
      tabIndex={0}
      onFocus={(e) => { if (e.target.matches(':focus-visible')) setShow(true); }}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!e.currentTarget.contains(next) && !tipRef.current?.contains(next)) setShow(false);
      }}
      onClick={() => { if (lastPointerType.current !== 'mouse') setShow((prev) => !prev); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setShow(false);
      }}
      role="img"
      aria-label={ariaLabel}
    >
      <InfoMark />
      {show && position && createPortal(
        <span
          ref={tipRef}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          style={{
            ...styles.tooltip,
            ...position,
            ...(interactive ? { pointerEvents: 'auto' as const } : {}),
          }}
        >
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}

export function InfoMark() {
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
    position: 'fixed' as const,
    padding: '10px 12px',
    borderRadius: '6px',
    border: '1px solid var(--tooltip-border)',
    backgroundColor: 'var(--tooltip-bg)',
    color: '#ffffff',
    fontSize: 'var(--tooltip-font-size)',
    fontWeight: 'normal' as const,
    fontStyle: 'normal' as const,
    textTransform: 'none' as const,
    letterSpacing: 'normal' as const,
    lineHeight: 1.4,
    textAlign: 'left' as const,
    whiteSpace: 'normal' as const,
    zIndex: 10000,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    pointerEvents: 'none' as const,
  },
};
