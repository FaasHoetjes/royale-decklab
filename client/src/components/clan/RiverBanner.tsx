import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ClanWar, RaceClan } from '../../api';
import { prefersReducedMotion } from '../../lib/motion';
import { useNow } from '../../hooks/useNow';
import { boatProgress, countdownText } from '../../lib/clanWar';
import LiveUpdated from './LiveUpdated';

const WAVES =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='28'%3E%3Cpath d='M0 14 Q15 6 30 14 T60 14 T90 14 T120 14' fill='none' stroke='rgba(140,190,255,0.10)' stroke-width='2'/%3E%3C/svg%3E\")";
const OUR_BOAT = '#e8b24a';
const OTHER_BOATS = ['#7dd3fc', '#c4b5fd', '#fca5a5', '#86efac', '#fdba74'];
const LANE_HEIGHT = 30;
const LABEL_FLIP_AT = 0.6;

/** Water stays dark in both themes: the banner is an illustration, so its colours are its own. */
export const water = {
  text: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.72)',
  line: 'rgba(125, 180, 255, 0.16)',
};

export const RiverWater = ({ children, isMobile }: { children: ReactNode; isMobile: boolean }) => (
  <section style={{ ...styles.water, padding: isMobile ? '16px 16px 14px' : '20px 24px 16px' }}>
    <div className="clan-waves" style={styles.waves} aria-hidden="true" />
    <div style={styles.glow} aria-hidden="true" />
    <div style={styles.content}>{children}</div>
  </section>
);

interface BannerTopProps {
  war: ClanWar;
  eyebrow: string;
  updatedAt: number;
  isMobile: boolean;
  aside?: ReactNode;
}

export const BannerTop = ({ war, eyebrow, updatedAt, isMobile, aside }: BannerTopProps) => (
  <div style={styles.top}>
    <div style={styles.titleBlock}>
      <span style={styles.eyebrow}>{eyebrow}</span>
      <h2 style={{ ...styles.name, fontSize: isMobile ? '24px' : '30px' }}>{war.name}</h2>
      <div style={styles.tagLine}>
        <span style={styles.tag}>{war.tag}</span>
        <LiveUpdated updatedAt={updatedAt} color={water.muted} />
      </div>
    </div>
    <div style={isMobile ? { ...styles.aside, ...styles.asideRow } : styles.aside}>
      <Link to="/clan" state={{ pickClan: true }} style={styles.otherClan}>
        Other clan
      </Link>
      {aside}
    </div>
  </div>
);

/** A live countdown chip; the reset time is estimated, hence the "~". */
export const CountdownChip = ({ lead, target }: { lead: string; target: string }) => {
  const now = useNow(1000);
  return (
    <span style={styles.chip}>
      <span className="clan-live-dot" style={styles.chipDot} aria-hidden="true" />
      <span>
        {lead} ~<span style={styles.chipTime}>{countdownText(Date.parse(target) - now)}</span>
      </span>
    </span>
  );
};

export const RaceBoat = ({ color, size, wake = false }: { color: string; size: number; wake?: boolean }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 48 34" className="clan-bob" style={styles.boat} aria-hidden="true">
    {wake && <ellipse className="clan-wake" cx="6" cy="29" rx="10" ry="2" fill="rgba(255,255,255,0.35)" />}
    <line x1="24" y1="2" x2="24" y2="24" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" />
    <path d="M24 3 L24 22 L39 22 Z" fill="#f8fafc" />
    <path d="M22.5 7 L22.5 22 L12 22 Z" fill="#e2e8f0" />
    <path d="M24 2 L31 4.5 L24 7 Z" fill={color} />
    <path d="M3 24 H45 L39 32 H9 Z" fill={color} />
    <path d="M3 24 H45 L44 26 H4 Z" fill="rgba(255,255,255,0.35)" />
  </svg>
);

export const boatColor = (war: ClanWar, clan: RaceClan, index: number) =>
  clan.tag === war.tag ? OUR_BOAT : (OTHER_BOATS[index % OTHER_BOATS.length] ?? OUR_BOAT);

/** Starts every boat at the start line and lets them sail out once the page has painted. */
const useSailed = () => {
  const [sailed, setSailed] = useState(prefersReducedMotion);
  useEffect(() => {
    if (sailed) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setSailed(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [sailed]);
  return sailed;
};

interface RaceLanesProps {
  war: ClanWar;
  atStartLine?: boolean;
  showFinish: boolean;
}

/** One lane per race clan, furthest boat on top; boats move with transforms so phones keep up. */
export const RaceLanes = ({ war, atStartLine = false, showFinish }: RaceLanesProps) => {
  const sailed = useSailed();
  return (
    <div style={{ ...styles.lanes, height: `${war.race.length * LANE_HEIGHT}px` }}>
      {showFinish && <div style={styles.finish} aria-hidden="true" />}
      {atStartLine && <div style={styles.startLine} aria-hidden="true" />}
      {war.race.map((clan, i) => {
        const isOurs = clan.tag === war.tag;
        const progress = atStartLine ? 0 : boatProgress(war, clan);
        const labelOnLeft = progress > LABEL_FLIP_AT;
        return (
          <div key={clan.tag} style={{ ...styles.lane, top: `${i * LANE_HEIGHT}px`, zIndex: isOurs ? 2 : 1 }}>
            <div
              className="clan-sail"
              style={{
                ...styles.sailer,
                transform: `translateX(${sailed ? progress * 100 : 0}%)`,
                transitionDelay: `${i * 90}ms`,
              }}
            >
              <span style={{ ...styles.boatSpot, filter: isOurs ? 'drop-shadow(0 0 8px rgba(232, 178, 74, 0.6))' : undefined }}>
                <RaceBoat color={boatColor(war, clan, i)} size={isOurs ? 38 : 28} wake={isOurs} />
              </span>
              {!atStartLine && (
                <span
                  style={{
                    ...styles.label,
                    ...(labelOnLeft ? styles.labelLeft : styles.labelRight),
                    ...(isOurs ? styles.labelOurs : {}),
                  }}
                >
                  {clan.name}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const BannerStat = ({ value, label, color = water.text }: { value: ReactNode; label: string; color?: string }) => (
  <span style={styles.stat}>
    <b style={{ ...styles.statValue, color }}>{value}</b> {label}
  </span>
);

const styles = {
  water: {
    position: 'relative' as const,
    overflow: 'hidden' as const,
    borderRadius: '18px',
    border: '1px solid rgba(125, 180, 255, 0.18)',
    background: 'linear-gradient(180deg, #0e2747, #0a1a31)',
    color: water.text,
    marginBottom: '20px',
  },
  waves: {
    position: 'absolute' as const,
    inset: 0,
    width: '200%',
    backgroundImage: WAVES,
    backgroundSize: '120px 28px',
  },
  glow: {
    position: 'absolute' as const,
    inset: 0,
    background: 'radial-gradient(circle at 12% 0, rgba(232, 178, 74, 0.18), transparent 45%)',
  },
  content: {
    position: 'relative' as const,
  },
  top: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: '10px 16px',
    flexWrap: 'wrap' as const,
  },
  titleBlock: {
    minWidth: 0,
    flex: '1 1 220px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: 800 as const,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    color: water.muted,
  },
  name: {
    margin: '2px 0 0',
    lineHeight: 1.15,
    fontWeight: 900 as const,
    color: water.text,
    textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
    overflowWrap: 'anywhere' as const,
  },
  tagLine: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: '4px 14px',
    marginTop: '4px',
  },
  tag: {
    fontSize: '12px',
    fontFamily: 'monospace',
    color: water.muted,
  },
  aside: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
    gap: '10px',
  },
  asideRow: {
    flexDirection: 'row-reverse' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    width: '100%',
  },
  otherClan: {
    fontSize: '13px',
    fontWeight: 700 as const,
    color: water.text,
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    textDecorationColor: 'rgba(255, 255, 255, 0.4)',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    padding: '5px 12px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    color: water.text,
    background: 'rgba(0, 0, 0, 0.35)',
    border: '1px solid rgba(255, 255, 255, 0.14)',
  },
  chipDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#4ade80',
  },
  chipTime: {
    fontVariantNumeric: 'tabular-nums' as const,
  },
  boat: {
    display: 'block' as const,
  },
  lanes: {
    position: 'relative' as const,
    margin: '18px 26px 12px 4px',
  },
  lane: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    height: `${LANE_HEIGHT}px`,
    borderTop: `1px dashed ${water.line}`,
  },
  sailer: {
    position: 'absolute' as const,
    inset: 0,
  },
  boatSpot: {
    position: 'absolute' as const,
    left: 0,
    bottom: '2px',
    transform: 'translateX(-50%)',
  },
  label: {
    position: 'absolute' as const,
    top: '50%',
    maxWidth: '45%',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 800 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    background: 'rgba(0, 0, 0, 0.45)',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  labelRight: {
    left: '22px',
    transform: 'translateY(-50%)',
  },
  labelLeft: {
    right: 'calc(100% + 22px)',
    transform: 'translateY(-50%)',
  },
  labelOurs: {
    background: OUR_BOAT,
    color: '#1a1407',
  },
  finish: {
    position: 'absolute' as const,
    top: '-6px',
    bottom: '-6px',
    right: '-14px',
    width: '10px',
    opacity: 0.85,
    backgroundImage:
      'linear-gradient(45deg, #fff 25%, transparent 25%, transparent 75%, #fff 75%), linear-gradient(45deg, #fff 25%, #111 25%, #111 75%, #fff 75%)',
    backgroundSize: '10px 10px',
    backgroundPosition: '0 0, 5px 5px',
  },
  startLine: {
    position: 'absolute' as const,
    top: '-6px',
    bottom: '-6px',
    left: '18px',
    width: '3px',
    opacity: 0.6,
    background: 'repeating-linear-gradient(180deg, #fff 0 6px, transparent 6px 12px)',
  },
  stat: {
    fontSize: '12px',
    color: water.muted,
    whiteSpace: 'nowrap' as const,
  },
  statValue: {
    fontFamily: "'Lilita One', system-ui, -apple-system, sans-serif",
    fontWeight: 400 as const,
    fontSize: '16px',
  },
};
