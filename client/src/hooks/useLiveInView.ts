import { useEffect, useState } from 'react';
import { liveSocketUrl, retryDelay } from '../lib/live';

const POLICY_VIOLATION = 1008;

type LiveCount = { inView: number };

const isLiveCount = (value: unknown): value is LiveCount =>
  typeof value === 'object' && value !== null && typeof (value as LiveCount).inView === 'number';

const parseCount = (data: unknown): number | null => {
  if (typeof data !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isLiveCount(parsed) ? parsed.inView : null;
  } catch {
    return null;
  }
};

/**
 * How many people have the site in view right now, pushed by the server; null while the connection is down. Without a
 * token it disconnects and keeps the last count, so a paused page holds still.
 */
export const useLiveInView = (token: string): number | null => {
  const [inView, setInView] = useState<number | null>(null);

  useEffect(() => {
    if (!token || typeof WebSocket === 'undefined') return;
    let socket: WebSocket | null = null;
    let attempts = 0;
    let retry: number | undefined;
    let stopped = false;

    const connect = () => {
      const opened = new WebSocket(liveSocketUrl('/api/admin/live'));
      socket = opened;
      opened.onopen = () => opened.send(token);
      opened.onmessage = (event) => {
        const count = parseCount(event.data);
        if (count === null) return;
        attempts = 0;
        setInView(count);
      };
      opened.onclose = (event) => {
        if (stopped) return;
        setInView(null);
        // A refused token won't be accepted on a second try either.
        if (event.code === POLICY_VIOLATION) return;
        retry = window.setTimeout(connect, retryDelay(attempts));
        attempts += 1;
      };
    };

    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [token]);

  return inView;
};
