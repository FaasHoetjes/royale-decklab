import { useEffect, useLayoutEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { getTheme } from '../theme';
import { useDialog } from '../hooks/useDialog';
import { FOLD_EASING, prefersReducedMotion } from '../lib/motion';
import { SidebarContent } from './Sidebar';

const SLIDE_MS = 260;
const CLOSED = 'translateX(-100%)';
const DRAG_START_PX = 8;
const DISMISS_SHARE = 0.3;
const FLING_SPEED_PX_PER_MS = 0.5;
const STALE_MOVE_MS = 100;

interface Drag {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  speed: number;
  isSliding: boolean;
  /** Measured once as the finger goes down: reading it on every move would force a layout per frame. */
  width: number;
}

/**
 * The desktop sidebar as a drawer that slides in from the left. It closes on a link, the dimmed page, Escape or a
 * swipe to the left, and slides with transforms only so it stays smooth on iPhone.
 */
export default function MobileDrawer({ onClose }: { onClose: () => void }) {
  const theme = getTheme();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const isClosing = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const slideTo = (open: boolean) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;
    // From wherever it is now, mid-slide included, so closing while it opens doesn't snap open first.
    const from = getComputedStyle(panel).transform;
    const fromOpacity = getComputedStyle(backdrop).opacity;
    stopSliding();
    const to = open ? 'none' : CLOSED;
    const toOpacity = open ? '1' : '0';
    panel.style.transform = to;
    backdrop.style.opacity = toOpacity;
    if (prefersReducedMotion()) {
      if (!open) onCloseRef.current();
      return;
    }
    const timing = { duration: SLIDE_MS, easing: FOLD_EASING };
    const slide = panel.animate({ transform: [from, to] }, timing);
    backdrop.animate({ opacity: [fromOpacity, toOpacity] }, timing);
    if (!open) slide.finished.then(() => onCloseRef.current(), () => {});
  };

  const stopSliding = () => {
    panelRef.current?.getAnimations().forEach((a) => a.cancel());
    backdropRef.current?.getAnimations().forEach((a) => a.cancel());
  };

  const close = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    drag.current = null;
    slideTo(false);
  };

  useDialog(panelRef, close);

  useLayoutEffect(() => slideTo(true), []);

  const openedOn = useRef(pathname);
  useEffect(() => {
    if (pathname !== openedOn.current) close();
  }, [pathname]);

  const closeOnLink = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target instanceof Element && e.target.closest('a[href]')) close();
  };

  const follow = (offset: number, width: number) => {
    const panel = panelRef.current;
    const backdrop = backdropRef.current;
    if (!panel || !backdrop) return;
    panel.style.transform = `translateX(${offset}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 + offset / width));
  };

  const startDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary || isClosing.current) return;
    drag.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastTime: e.timeStamp, speed: 0, isSliding: false, width: e.currentTarget.offsetWidth };
  };

  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const dx = e.clientX - current.startX;
    if (!current.isSliding) {
      const dy = e.clientY - current.startY;
      if (Math.abs(dy) > DRAG_START_PX && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      if (Math.abs(dx) <= DRAG_START_PX) return;
      // Captured only once it's a swipe, so a tap still reaches the link under the finger.
      current.isSliding = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      stopSliding();
    }
    const elapsed = e.timeStamp - current.lastTime;
    if (elapsed > 0) current.speed = (e.clientX - current.lastX) / elapsed;
    current.lastX = e.clientX;
    current.lastTime = e.timeStamp;
    follow(Math.min(0, dx), current.width);
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== e.pointerId) return;
    drag.current = null;
    if (!current.isSliding) return;
    const offset = Math.min(0, current.lastX - current.startX);
    const isFarEnough = -offset > current.width * DISMISS_SHARE;
    const isStillMoving = e.timeStamp - current.lastTime < STALE_MOVE_MS;
    const isFlung = offset < 0 && isStillMoving && current.speed < -FLING_SPEED_PX_PER_MS;
    if (e.type === 'pointerup' && (isFarEnough || isFlung)) close();
    else slideTo(true);
  };

  return (
    <>
      <div ref={backdropRef} onClick={close} aria-hidden="true" style={styles.backdrop} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        onClick={closeOnLink}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ ...styles.panel, backgroundColor: theme.bg.secondary, borderRightColor: theme.border }}
      >
        <button type="button" onClick={close} className="visually-hidden">
          Close menu
        </button>
        <nav aria-label="Main menu" style={styles.nav}>
          <SidebarContent />
        </nav>
      </div>
    </>
  );
}

const styles = {
  backdrop: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 1400,
    opacity: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  panel: {
    position: 'fixed' as const,
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1401,
    width: 'min(280px, 85vw)',
    boxSizing: 'border-box' as const,
    padding: 'calc(24px + env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom))',
    borderRight: '1px solid',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.4)',
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    touchAction: 'pan-y' as const,
    transform: 'translateX(-100%)',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    outline: 'none',
  },
  nav: {
    flex: '1 0 auto',
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
};
