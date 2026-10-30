import { useCallback, useLayoutEffect, useRef } from 'react';

type Spot = { x: number; y: number };

/**
 * Slides each card from its old place to its new one when `orderKey` changes, instead of jumping.
 * Returns a ref to attach to every card, keyed by the card's id.
 */
export function useShuffleAnimation(orderKey: string) {
  const els = useRef(new Map<number, HTMLElement>());
  const spots = useRef(new Map<number, Spot>());
  const lastKey = useRef(orderKey);

  // Layout offsets rather than screen positions, so scrolling between two sorts doesn't skew the slide.
  useLayoutEffect(() => {
    const now = new Map<number, Spot>();
    els.current.forEach((el, id) => now.set(id, { x: el.offsetLeft, y: el.offsetTop }));

    if (orderKey !== lastKey.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.current.forEach((el, id) => {
        const from = spots.current.get(id);
        const to = now.get(id);
        if (!from || !to) return;
        const dx = from.x - to.x;
        const dy = from.y - to.y;
        if (dx || dy) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 350,
            easing: 'ease',
          });
        }
      });
    }

    lastKey.current = orderKey;
    spots.current = now;
  });

  const refs = useRef(new Map<number, (el: HTMLElement | null) => void>());
  return useCallback((id: number) => {
    let ref = refs.current.get(id);
    if (!ref) {
      ref = (el) => {
        if (el) els.current.set(id, el);
        else els.current.delete(id);
      };
      refs.current.set(id, ref);
    }
    return ref;
  }, []);
}
