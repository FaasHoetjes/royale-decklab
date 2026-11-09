import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { prefersReducedMotion } from '../lib/motion';
import { CrossIcon } from './generator/icons';

const PHONE_QUERY = '(max-width: 639px)';
const DISMISS_DISTANCE_PX = 140;
const DISMISS_SHARE = 0.3;
const FLING_SPEED_PX_PER_MS = 0.6;
const STALE_MOVE_MS = 100;
const SLIDE_MS = 200;
const EASING = 'cubic-bezier(0.3, 0.7, 0.2, 1)';
const NOT_A_HANDLE = 'button, a, input, select, textarea, label';

type Name = { title: string; ariaLabel?: never } | { title?: never; ariaLabel: string };

type SheetProps = Name & {
  icon?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
};

interface Drag {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTime: number;
  speed: number;
}

const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

/**
 * A bottom sheet on phones, swiped down by its header to close, and a centred dialog on wider screens. The header
 * and footer stay put while the body scrolls.
 */
const Sheet = ({ title, ariaLabel, icon, footer, onClose, children }: SheetProps) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  // Read while rendering, before the sheet takes focus; an effect would see the sheet itself on a second run.
  const [opener] = useState(() => document.activeElement);
  // The page behind refetches while the sheet is open; keep the effect from re-running.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
      // Closing can open something else that takes focus, like the card picker; only hand back focus that was lost.
      const isFocusLost = document.activeElement == null || document.activeElement === document.body;
      if (isFocusLost && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  const follow = (offset: number) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;
    sheet.style.transform = offset > 0 ? `translateY(${offset}px)` : '';
    backdrop.style.opacity = String(Math.max(0, 1 - offset / sheet.offsetHeight));
  };

  const settle = (isClosing: boolean) => {
    const sheet = sheetRef.current;
    const backdrop = backdropRef.current;
    if (!sheet || !backdrop) return;
    if (isClosing && prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }
    sheet.style.transition = `transform ${SLIDE_MS}ms ${EASING}`;
    backdrop.style.transition = `opacity ${SLIDE_MS}ms ease`;
    if (!isClosing) {
      follow(0);
      backdrop.style.opacity = '';
      return;
    }
    sheet.style.transform = 'translateY(100%)';
    backdrop.style.opacity = '0';
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), SLIDE_MS);
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    const startsOnControl = e.target instanceof Element && e.target.closest(NOT_A_HANDLE) != null;
    if (!isPhone() || startsOnControl || !e.isPrimary || closeTimer.current != null) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sheet.style.animation = 'none';
    sheet.style.transition = 'none';
    if (backdropRef.current) backdropRef.current.style.transition = 'none';
    drag.current = { pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY, lastTime: e.timeStamp, speed: 0 };
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const elapsed = e.timeStamp - current.lastTime;
    if (elapsed > 0) current.speed = (e.clientY - current.lastY) / elapsed;
    current.lastY = e.clientY;
    current.lastTime = e.timeStamp;
    follow(Math.max(0, e.clientY - current.startY));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    drag.current = null;
    const sheet = sheetRef.current;
    if (!sheet) return;
    const offset = Math.max(0, current.lastY - current.startY);
    const isFarEnough = offset > Math.min(DISMISS_DISTANCE_PX, sheet.offsetHeight * DISMISS_SHARE);
    const isStillMoving = e.timeStamp - current.lastTime < STALE_MOVE_MS;
    const isFlung = offset > 0 && isStillMoving && current.speed > FLING_SPEED_PX_PER_MS;
    settle(e.type === 'pointerup' && (isFarEnough || isFlung));
  };

  const closeButton = (
    <button type="button" onClick={onClose} aria-label="Close" className="sheet-close">
      <CrossIcon size={14} />
    </button>
  );

  return (
    <>
      <div ref={backdropRef} className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={ariaLabel}
        tabIndex={-1}
        className="sheet"
      >
        <div
          className="sheet-head"
          data-scrolled={isScrolled}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div aria-hidden="true" className="sheet-handle" />
          {title ? (
            <div className="sheet-title-row">
              {icon}
              <h2 id={titleId} className="sheet-title">
                {title}
              </h2>
              {closeButton}
            </div>
          ) : (
            <div className="sheet-corner">{closeButton}</div>
          )}
        </div>
        <div className="sheet-body" onScroll={(e) => setIsScrolled(e.currentTarget.scrollTop > 2)}>
          {children}
        </div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
};

export default Sheet;
