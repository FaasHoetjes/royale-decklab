import { flushSync } from 'react-dom';

export const FOLD_DURATION = 300;
export const FOLD_EASING = 'cubic-bezier(0.3, 0.7, 0.2, 1)';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * What's laid out after `el` and can come into view while sliding `distance`. Whatever starts lower stays off
 * screen the whole time, and leaving it alone spares the browser from painting it into a layer of its own.
 */
function below(el: HTMLElement, distance: number): HTMLElement[] {
  const reach = window.innerHeight + distance;
  const moved: HTMLElement[] = [];
  for (let node: HTMLElement | null = el; node && node.tagName !== 'MAIN'; node = node.parentElement) {
    for (let next = node.nextElementSibling; next; next = next.nextElementSibling) {
      if (next instanceof HTMLElement && next.getBoundingClientRect().top < reach) moved.push(next);
    }
  }
  return moved;
}

/** A box drawn around a sliding panel: `inner` draws it, `outer` holds just `inner`. */
export interface SlideBox {
  outer: HTMLElement;
  inner: HTMLElement;
}

let inFlight: (() => void) | null = null;

/**
 * Fades `panel` in or out while everything below it slides down from under it or up over it, with transforms
 * the GPU moves without any layout or paint. Animating the panel's height instead repaints the page below on
 * every frame, which stutters on phones once that page is long. `panel` has to be laid out at full height for
 * the whole slide; `onEnd` runs as it ends, before the transforms come off, to take a closed panel away.
 *
 * A `box` around the panel grows and shrinks along: `outer` slides like the page below it and cuts off what's
 * past its lower edge, while `inner` slides the other way and so stays put.
 */
export function slide(panel: HTMLElement, open: boolean, { box, onEnd }: { box?: SlideBox; onEnd?: () => void } = {}) {
  inFlight?.();

  const height = panel.offsetHeight;
  const timing: KeyframeAnimationOptions = { duration: FOLD_DURATION, easing: FOLD_EASING, fill: 'forwards' };
  const shift = (el: HTMLElement, by: number) => {
    const shifted = `translateY(${by}px)`;
    return el.animate({ transform: open ? [shifted, 'none'] : ['none', shifted] }, timing);
  };
  const fade = panel.animate({ opacity: open ? [0, 1] : [1, 0] }, timing);
  const animations = [fade, ...below(box?.outer ?? panel, height).map((el) => shift(el, -height))];
  if (box) {
    box.outer.style.clipPath = `inset(0 round ${getComputedStyle(box.inner).borderRadius})`;
    animations.push(shift(box.outer, -height), shift(box.inner, height));
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight = null;
    onEnd?.();
    if (box) box.outer.style.clipPath = '';
    animations.forEach((a) => a.cancel());
  };
  inFlight = finish;
  fade.finished.then(finish, () => {});
}

/**
 * Folds `panel` open or shut with `slide`. `render` shows the new state: right away when opening, so the panel
 * can be measured, and once the slide ends when closing.
 */
export function slideFold(panel: HTMLElement, open: boolean, render: () => void) {
  inFlight?.();
  if (prefersReducedMotion()) {
    render();
    return;
  }
  if (open) flushSync(render);
  slide(panel, open, { onEnd: open ? undefined : () => flushSync(render) });
}
