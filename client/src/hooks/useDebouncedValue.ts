import { useEffect, useState } from 'react';

// Returns a copy of `value` that only updates after it has stopped changing for
// `delayMs`. Used to debounce the builder's deck edits before they feed the
// scoring query, so a flurry of card placements scores once instead of per-edit.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
