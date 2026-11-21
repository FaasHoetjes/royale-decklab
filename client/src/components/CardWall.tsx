import { useEffect, useRef } from 'react';
import { useBestDecks } from '../queries';
import { cardIconUrl, versionOf } from '../lib/cardDisplay';

const MAX_ART = 40;
const CARDS_PER_COLUMN = 12;

// Just enough at the bottom for the footer, which only shows once the page is scrolled to its end.
const BOTTOM_FADE = 'linear-gradient(to top, var(--bg-primary) 40px, transparent 110px)';
// Solid behind the hero in the middle of the window, so its text stays readable over the art.
const DESKTOP_SPOTLIGHT =
  'radial-gradient(ellipse 36% 40% at 50% 50%, var(--bg-primary) 45%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 70%, color-mix(in srgb, var(--bg-primary) 35%, transparent) 100%)';
const PHONE_SPOTLIGHT =
  'radial-gradient(ellipse 62% 36% at 50% 50%, var(--bg-primary) 50%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 75%, color-mix(in srgb, var(--bg-primary) 40%, transparent) 100%)';
const LAYOUTS = {
  desktop: { columns: 18, width: 118, gap: 18, spotlight: DESKTOP_SPOTLIGHT },
  phone: { columns: 9, width: 86, gap: 12, spotlight: PHONE_SPOTLIGHT },
} as const;

// The spotlight is gone once the page has scrolled this share of the window, about when the hero leaves it.
const SPOTLIGHT_SCROLL_SHARE = 0.5;

function useSpotlightFade(shown: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const progress = Math.min(1, window.scrollY / (window.innerHeight * SPOTLIGHT_SCROLL_SHARE));
      if (ref.current) ref.current.style.opacity = String(1 - progress);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [shown]);
  return ref;
}

/**
 * Tilted columns of the meta's cards drifting up and down behind the window, faded out toward the middle while the hero is in view.
 * It sticks to the window inside a grid cell it shares with the page, rather than being fixed, so it ends with the
 * page's content and moves with it when Safari bounces at either end, instead of showing in the gap.
 * The layer sticks just below the phone's 61px header plus the main column's padding; the wall inside reaches back
 * over that padding to the window's edges, and down over the bottom padding to the end of the page.
 * Only content that is itself positioned paints over it.
 */
export default function CardWall({ isMobile }: { isMobile: boolean }) {
  const sets = useBestDecks().data?.sets ?? [];
  const art = [
    ...new Set(
      sets.flatMap((set) =>
        set.decks.flatMap((deck) => deck.cards.map((card) => cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))))
      )
    ),
  ]
    .filter(Boolean)
    .slice(0, MAX_ART);
  const spotlightRef = useSpotlightFade(art.length > 0);
  if (art.length === 0) return null;

  const layout = isMobile ? LAYOUTS.phone : LAYOUTS.desktop;

  return (
    <div aria-hidden="true" style={{ ...styles.layer, ...(isMobile ? styles.phoneLayer : styles.desktopLayer) }}>
    <div className="card-wall" style={{ ...styles.wall, ...(isMobile ? styles.phoneWall : styles.desktopWall) }}>
      <div style={{ ...styles.columns, gap: `${layout.gap}px` }}>
        {Array.from({ length: layout.columns }, (_, c) => {
          const cards = Array.from({ length: CARDS_PER_COLUMN }, (_, i) => art[(c * CARDS_PER_COLUMN + i) % art.length]);
          return (
            // Each column holds its cards twice and drifts by half its height, so the loop has no seam.
            <div
              key={c}
              className="card-wall-column"
              style={{
                width: `${layout.width}px`,
                flexShrink: 0,
                animationDuration: `${60 + (c % 4) * 9}s`,
                animationDirection: c % 2 ? 'reverse' : 'normal',
              }}
            >
              {[...cards, ...cards].map((src, i) => (
                <img key={i} src={src} alt="" decoding="async" style={{ ...styles.card, marginBottom: `${layout.gap}px` }} />
              ))}
            </div>
          );
        })}
      </div>
      <div ref={spotlightRef} style={{ ...styles.fade, background: layout.spotlight }} />
      <div style={{ ...styles.fade, background: BOTTOM_FADE }} />
    </div>
    </div>
  );
}

const styles = {
  layer: {
    gridArea: '1 / 1',
    alignSelf: 'start' as const,
    position: 'sticky' as const,
    pointerEvents: 'none' as const,
  },
  phoneLayer: {
    top: '73px',
    height: 'calc(100lvh - 73px)',
  },
  desktopLayer: {
    top: '20px',
    height: 'calc(100lvh - 20px)',
  },
  wall: {
    position: 'absolute' as const,
    overflow: 'hidden' as const,
  },
  phoneWall: {
    top: '-12px',
    bottom: 'calc(-12px - env(safe-area-inset-bottom))',
    left: 'calc(50% - 50vw)',
    width: '100vw',
  },
  desktopWall: {
    top: '-20px',
    bottom: '-20px',
    left: '-20px',
    right: '-20px',
  },
  columns: {
    position: 'absolute' as const,
    inset: '-35%',
    display: 'flex' as const,
    justifyContent: 'center' as const,
    rotate: '-11deg',
    opacity: 0.6,
  },
  card: {
    display: 'block' as const,
    width: '100%',
    // Reserve the art's natural proportions before it loads, keeping the drifting columns stable.
    aspectRatio: '285 / 420',
  },
  fade: {
    position: 'absolute' as const,
    inset: 0,
  },
};
