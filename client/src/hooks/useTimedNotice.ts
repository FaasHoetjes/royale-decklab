import { useEffect, useRef, useState } from 'react';

const NOTICE_MS = 2600;

/** A short message that clears itself; a new one replaces the one still showing. */
export function useTimedNotice() {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const showNotice = (text: string) => {
    setNotice(text);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  };

  useEffect(() => () => {
    if (timer.current != null) window.clearTimeout(timer.current);
  }, []);

  return { notice, showNotice };
}
