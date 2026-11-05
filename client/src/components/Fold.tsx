import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { prefersReducedMotion, FOLD_DURATION, FOLD_EASING } from '../lib/motion';

interface FoldProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
}

/**
 * Folds its content open and shut by animating a measured pixel height. Animating grid-template-rows from
 * 0fr to 1fr instead has Safari lay the content out again on every frame, which stutters on phones.
 */
export default function Fold({ open, style, children, ...rest }: FoldProps) {
  const ref = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || wasOpen.current === open) return;
    wasOpen.current = open;
    if (prefersReducedMotion()) return;

    // A fold reversed halfway starts from where it is now, not from fully open or shut.
    const running = el.getAnimations();
    let from: number;
    let fromOpacity: number;
    if (running.length > 0) {
      from = el.getBoundingClientRect().height;
      fromOpacity = Number(getComputedStyle(el).opacity);
    } else {
      from = open ? 0 : el.scrollHeight;
      fromOpacity = open ? 0 : 1;
    }
    running.forEach((a) => a.cancel());
    el.animate(
      [
        { height: `${from}px`, opacity: fromOpacity, visibility: 'visible' },
        { height: `${open ? el.scrollHeight : 0}px`, opacity: open ? 1 : 0, visibility: 'visible' },
      ],
      { duration: FOLD_DURATION, easing: FOLD_EASING },
    );
  }, [open]);

  return (
    <div ref={ref} style={{ ...style, ...styles.fold, ...(open ? {} : styles.shut) }} {...rest}>
      {children}
    </div>
  );
}

const styles = {
  fold: {
    overflow: 'hidden' as const,
  },
  shut: {
    height: 0,
    opacity: 0,
    visibility: 'hidden' as const,
  },
};
