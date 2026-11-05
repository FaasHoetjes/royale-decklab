import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../lib/motion';

/** Counts a number up or down to its new value instead of jumping there. */
export function useTween(value: number, from = value, durationMs = 650): number {
  const [shown, setShown] = useState(from);
  const current = useRef(from);

  useEffect(() => {
    if (prefersReducedMotion()) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = current.current;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = start + (value - start) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return shown;
}
