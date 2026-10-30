import { useLayoutEffect, useRef } from 'react';

/** Folds an element away to nothing and back out again, animating its height. Returns a ref for the element. */
export function useFold<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const first = useRef(true);
  const running = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    running.current?.cancel();
    const animate = !first.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    first.current = false;

    if (open) {
      el.style.display = '';
      if (!animate) return;
      el.style.overflow = 'hidden';
      running.current = el.animate(
        [
          { height: '0px', opacity: 0 },
          { height: `${el.scrollHeight}px`, opacity: 1 },
        ],
        { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      );
      running.current.onfinish = () => {
        el.style.overflow = '';
      };
    } else {
      if (!animate) {
        el.style.display = 'none';
        return;
      }
      el.style.overflow = 'hidden';
      running.current = el.animate(
        [
          { height: `${el.offsetHeight}px`, opacity: 1 },
          { height: '0px', opacity: 0 },
        ],
        { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }
      );
      running.current.onfinish = () => {
        el.style.display = 'none';
        el.style.overflow = '';
      };
    }
  }, [open]);

  return ref;
}
