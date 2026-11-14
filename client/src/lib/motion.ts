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
  const animations = [fade, ...below(panel, height).map((el) => shift(el, -height))];
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
export function slideFold(panel: HTMLElement, open: boolean, render: () => void, box?: SlideBox) {
  inFlight?.();
  if (prefersReducedMotion()) {
    render();
    return;
  }
  if (open) flushSync(render);
  slide(panel, open, { box, onEnd: open ? undefined : () => flushSync(render) });
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Longer for a longer way, so a short hop doesn't drag and a long one doesn't jump. */
export const scrollDuration = (distance: number) => Math.min(800, Math.max(400, 300 + Math.abs(distance) * 0.25));

const USER_SCROLL_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const;

/**
 * Scrolls the window to `el`, honouring its scroll-margin-top, easing in and out. On desktop the browser's own
 * smooth scroll is quick and abrupt, and differs per browser. Any wheel, touch or key from the user hands control back.
 */
export function scrollToElement(el: HTMLElement) {
  const targetTop = () => el.getBoundingClientRect().top + window.scrollY - (parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
  if (prefersReducedMotion()) {
    window.scrollTo(0, targetTop());
    return;
  }
  // On a phone a scroll driven frame by frame from script stutters, as Safari's toolbars shrink and resize the
  // page under it; the browser's own smooth scroll runs off the main thread and keeps up.
  if (window.matchMedia('(pointer: coarse)').matches) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  const from = window.scrollY;
  const duration = scrollDuration(targetTop() - from);
  const start = performance.now();
  let frame = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    USER_SCROLL_EVENTS.forEach((type) => window.removeEventListener(type, stop));
  };
  // Measured each frame, so content that loads in above the target doesn't throw the landing off.
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from + (targetTop() - from) * easeInOutCubic(t));
    if (t < 1) frame = requestAnimationFrame(step);
    else stop();
  };
  USER_SCROLL_EVENTS.forEach((type) => window.addEventListener(type, stop, { passive: true }));
  frame = requestAnimationFrame(step);
}
