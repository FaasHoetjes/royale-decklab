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

let inFlight: (() => void) | null = null;

/**
 * Folds `panel` open or shut by sliding everything below it with transforms, which the GPU moves without
 * any layout or paint. Animating the panel's height instead repaints the page below on every frame, which
 * stutters on phones once that page is long. `render` shows the new state: right away when opening, so the
 * panel can be measured, and once the slide ends when closing. Only for a panel with nothing boxed around
 * it, since a box around it would keep its old height until the end.
 */
export function slideFold(panel: HTMLElement, open: boolean, render: () => void) {
  inFlight?.();
  if (prefersReducedMotion()) {
    render();
    return;
  }
  if (open) flushSync(render);

  const height = panel.offsetHeight;
  const shifted = `translateY(${-height}px)`;
  const timing: KeyframeAnimationOptions = { duration: FOLD_DURATION, easing: FOLD_EASING, fill: 'forwards' };
  const fade = panel.animate({ opacity: open ? [0, 1] : [1, 0] }, timing);
  const animations = [fade, ...below(panel, height).map((el) => el.animate({ transform: open ? [shifted, 'none'] : ['none', shifted] }, timing))];

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    inFlight = null;
    if (!open) flushSync(render);
    animations.forEach((a) => a.cancel());
  };
  inFlight = finish;
  fade.finished.then(finish, () => {});
}
