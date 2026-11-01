import { useEffect, useState } from 'react';

const SPINS = 2;
// One digit past the last cycle so the overshoot in the easing never shows an empty slot.
const STRIP = Array.from({ length: (SPINS + 1) * 10 + 1 }, (_, i) => i % 10);

/** Rolls each digit into place like a slot machine reel, stopping left to right. */
export default function SlotNumber({ value }: { value: number }) {
  const text = value.toLocaleString('en-US');
  const [spun, setSpun] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    if (spun) return;
    // Two frames so the reels paint at 0 before the transition to their digit starts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setSpun(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [spun]);

  let reel = 0;
  return (
    <span aria-label={text} role="img" style={styles.number}>
      {[...text].map((char, i) => {
        if (char < '0' || char > '9') return <span key={i} aria-hidden="true">{char}</span>;
        const stop = SPINS * 10 + Number(char);
        const delay = reel++ * 140;
        return (
          <span key={i} aria-hidden="true" style={styles.reel}>
            <span
              style={{
                ...styles.strip,
                transform: `translateY(-${spun ? stop * 1.2 : 0}em)`,
                transition: spun ? `transform ${900 + delay}ms cubic-bezier(0.3, 0.9, 0.35, 1.04)` : 'none',
              }}
            >
              {STRIP.map((digit, j) => (
                <span key={j} style={styles.digit}>{digit}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const styles = {
  number: {
    display: 'inline-flex' as const,
    verticalAlign: 'top' as const,
    lineHeight: '1.2em',
  },
  reel: {
    display: 'inline-block' as const,
    height: '1.2em',
    lineHeight: '1.2em',
    overflow: 'hidden' as const,
  },
  strip: {
    display: 'block' as const,
    willChange: 'transform' as const,
  },
  digit: {
    display: 'block' as const,
  },
};
