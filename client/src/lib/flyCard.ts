/** Flies a copy of a card's art from where it was picked to the slot it landed in. */
export function flyCard(from: DOMRect, to: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const src = to.querySelector('img')?.src;
  if (!src) return;

  const end = to.getBoundingClientRect();
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  Object.assign(img.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    objectFit: 'cover',
    borderRadius: '10px',
    boxShadow: '0 12px 24px rgba(0, 0, 0, 0.4)',
    transformOrigin: '0 0',
    pointerEvents: 'none',
    zIndex: '1000',
  });
  document.body.appendChild(img);
  to.style.visibility = 'hidden';

  const dx = end.left - from.left;
  const dy = end.top - from.top;
  const scale = end.width / from.width;
  const flight = img.animate(
    [
      { transform: 'none' },
      { transform: `translate(${dx}px, ${dy - 30}px) scale(${(1 + scale) / 2})`, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
    ],
    { duration: 420, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' }
  );
  const land = () => {
    img.remove();
    to.style.visibility = '';
  };
  flight.onfinish = land;
  flight.oncancel = land;
}

/** Restarts a one-shot CSS animation on an element that is already showing. */
export function replayAnimation(el: Element | null, className: string) {
  if (!el) return;
  el.classList.remove(className);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(className);
}
