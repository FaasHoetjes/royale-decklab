// The live connection that tells the admin stats page someone is looking at the site, and for how long. Nothing is
// stored in the browser for it.
import { isStatsExcluded } from './stats';

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
const LONGEST_RETRY_MS = 30_000;
const RETRY_JITTER_MS = 1_000;
const IN_VIEW = 'v';
const HIDDEN = 'h';
// A tab left open on a second screen would otherwise count as someone looking for hours.
const IDLE_AFTER_MS = 10 * 60_000;
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

export const liveSocketUrl = (path: string) =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}${path}`;

/** Waits longer after each failed try, with some jitter so a server restart isn't met by every tab at once. */
export const retryDelay = (attempts: number) =>
  (RETRY_DELAYS_MS[attempts] ?? LONGEST_RETRY_MS) + Math.random() * RETRY_JITTER_MS;

const isInView = () => document.visibilityState === 'visible';

/** Keeps the connection open, reconnecting after a restart, and returns what closes it for good. */
export const startPresence = (): (() => void) => {
  if (typeof WebSocket === 'undefined' || isStatsExcluded()) return () => {};

  let socket: WebSocket | null = null;
  let attempts = 0;
  let retry: number | undefined;
  let stopped = false;
  let lastActivity = Date.now();
  let idle = false;
  let idleCheck: number | undefined;

  const sendState = () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(isInView() && !idle ? IN_VIEW : HIDDEN);
  };

  // Rescheduled from the last activity when it fires, so moving the mouse doesn't reset a timer on every event.
  const scheduleIdleCheck = () => {
    window.clearTimeout(idleCheck);
    const remaining = IDLE_AFTER_MS - (Date.now() - lastActivity);
    idleCheck = window.setTimeout(() => {
      if (Date.now() - lastActivity < IDLE_AFTER_MS) {
        scheduleIdleCheck();
        return;
      }
      idle = true;
      sendState();
    }, Math.max(0, remaining));
  };

  /** True when the tab was idle until now. */
  const markActive = () => {
    lastActivity = Date.now();
    if (!idle) return false;
    idle = false;
    scheduleIdleCheck();
    return true;
  };

  const onActivity = () => {
    if (markActive()) sendState();
  };

  const connect = () => {
    window.clearTimeout(retry);
    if (stopped || socket || isStatsExcluded()) return;
    const opened = new WebSocket(liveSocketUrl('/api/live'));
    socket = opened;
    opened.onopen = () => {
      attempts = 0;
      sendState();
    };
    opened.onclose = () => {
      if (socket === opened) socket = null;
      scheduleReconnect();
    };
  };

  // A hidden page waits until it's back in view, so a phone doesn't keep reconnecting in the background.
  const scheduleReconnect = () => {
    if (stopped || !isInView()) return;
    retry = window.setTimeout(connect, retryDelay(attempts));
    attempts += 1;
  };

  const onVisibilityChange = () => {
    if (isInView()) markActive();
    if (socket) {
      sendState();
      return;
    }
    if (isInView()) connect();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, { capture: true, passive: true });
  scheduleIdleCheck();
  connect();

  return () => {
    stopped = true;
    window.clearTimeout(retry);
    window.clearTimeout(idleCheck);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, { capture: true });
    socket?.close();
  };
};
