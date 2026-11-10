import { useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion, slide } from '../lib/motion';

/**
 * Slides the element this returns a ref for open and shut as `open` changes. Shut, it is display: none once the
 * slide ends, and starts that way without animating. For one panel at a time: `slide` ends any slide still running.
 */
export function useSlideFold<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (wasOpen.current === open) {
      if (!open) el.style.display = 'none';
      return;
    }
    wasOpen.current = open;
    if (prefersReducedMotion()) {
      el.style.display = open ? '' : 'none';
      return;
    }
    if (open) el.style.display = '';
    slide(el, open, {
      // A reopen that interrupts a shut slide ends it too, and must not hide the element it is opening.
      onEnd: open
        ? undefined
        : () => {
            if (!wasOpen.current) el.style.display = 'none';
          },
    });
  }, [open]);

  return ref;
}
