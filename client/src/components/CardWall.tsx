import { useBestDecks } from '../queries';
import { cardIconUrl, versionOf } from '../lib/cardDisplay';

const MAX_ART = 40;
const CARDS_PER_COLUMN = 12;

// Solid behind the hero and the footer, so the text stays readable over the art.
const DESKTOP_FADE = [
  'linear-gradient(to top, var(--bg-primary) 40px, transparent 110px)',
  'radial-gradient(ellipse 36% 40% at 50% 50%, var(--bg-primary) 45%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 70%, color-mix(in srgb, var(--bg-primary) 35%, transparent) 100%)',
].join(', ');
const PHONE_FADE = [
  'linear-gradient(to top, var(--bg-primary) 150px, transparent 220px)',
  'radial-gradient(ellipse 62% 36% at 50% 50%, var(--bg-primary) 50%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 75%, color-mix(in srgb, var(--bg-primary) 40%, transparent) 100%)',
].join(', ');
const DESKTOP_BANNER_FADE = [
  'linear-gradient(to top, var(--bg-primary) 6px, transparent 70px)',
  'radial-gradient(ellipse 42% 58% at 50% 50%, var(--bg-primary) 45%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 70%, color-mix(in srgb, var(--bg-primary) 35%, transparent) 100%)',
].join(', ');
const PHONE_BANNER_FADE = [
  'linear-gradient(to top, var(--bg-primary) 6px, transparent 60px)',
  'radial-gradient(ellipse 70% 58% at 50% 50%, var(--bg-primary) 48%, color-mix(in srgb, var(--bg-primary) 82%, transparent) 75%, color-mix(in srgb, var(--bg-primary) 40%, transparent) 100%)',
].join(', ');

/** `page` fills the window behind the landing page; `banner` fills its positioned parent, behind a page's heading. */
export type CardWallVariant = 'page' | 'banner';

const LAYOUTS = {
  page: {
    desktop: { columns: 18, width: 118, gap: 18, fade: DESKTOP_FADE },
    phone: { columns: 9, width: 86, gap: 12, fade: PHONE_FADE },
  },
  banner: {
    desktop: { columns: 16, width: 84, gap: 14, fade: DESKTOP_BANNER_FADE },
    phone: { columns: 8, width: 66, gap: 10, fade: PHONE_BANNER_FADE },
  },
} as const;

/** Tilted columns of the meta's cards drifting up and down, faded out toward the middle. */
export default function CardWall({ isMobile, variant = 'page' }: { isMobile: boolean; variant?: CardWallVariant }) {
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
  if (art.length === 0) return null;

  const layout = LAYOUTS[variant][isMobile ? 'phone' : 'desktop'];
  const placement = variant === 'page' ? { ...styles.page, left: isMobile ? 0 : '240px' } : styles.banner;

  return (
    <div className="card-wall" aria-hidden="true" style={{ ...styles.wall, ...placement }}>
      <div style={{ ...styles.columns, gap: `${layout.gap}px` }}>
        {Array.from({ length: layout.columns }, (_, c) => {
          const cards = Array.from({ length: CARDS_PER_COLUMN }, (_, i) => art[(c * 5 + i) % art.length]);
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
      <div style={{ ...styles.fade, background: layout.fade }} />
    </div>
  );
}

const styles = {
  wall: {
    overflow: 'hidden' as const,
    pointerEvents: 'none' as const,
  },
  page: {
    position: 'fixed' as const,
    top: 0,
    right: 0,
    bottom: 0,
  },
  banner: {
    position: 'absolute' as const,
    inset: 0,
    maskImage: 'linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
    WebkitMaskImage: 'linear-gradient(to right, transparent, #000 10%, #000 90%, transparent)',
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
