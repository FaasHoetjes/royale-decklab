import { useRef, type KeyboardEvent } from 'react';

function targetIndex(key: string, index: number, count: number, vertical: boolean): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const isPrevious = key === 'ArrowLeft' || (vertical && key === 'ArrowUp');
  if (isPrevious) return (index - 1 + count) % count;
  const isNext = key === 'ArrowRight' || (vertical && key === 'ArrowDown');
  if (isNext) return (index + 1) % count;
  return null;
}

/**
 * Keyboard handling for a row of buttons that acts as one widget (radio group or tab list): arrows, Home and End
 * move focus and select. Give the selected button tabIndex 0 and the rest -1, so Tab leaves the group in one stop.
 */
export function useRovingGroup(count: number, select: (index: number) => void, vertical = false) {
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  const itemRef = (index: number) => (el: HTMLButtonElement | null) => {
    items.current[index] = el;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const target = targetIndex(e.key, index, count, vertical);
    if (target == null) return;
    e.preventDefault();
    items.current[target]?.focus();
    select(target);
  };

  return { itemRef, onKeyDown };
}
