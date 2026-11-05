// The live connection that tells the admin stats page someone is looking at the site, and for how long. Nothing is
// stored in the browser for it.
import { isStatsExcluded } from './stats';

const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000] as const;
const LONGEST_RETRY_MS = 30_000;
const RETRY_JITTER_MS = 1_000;
const IN_VIEW = 'v';
const HIDDEN = 'h';

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

  const sendState = () => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(isInView() ? IN_VIEW : HIDDEN);
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
    if (socket) {
      sendState();
      return;
    }
    if (isInView()) connect();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  connect();

  return () => {
    stopped = true;
    window.clearTimeout(retry);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    socket?.close();
  };
};
