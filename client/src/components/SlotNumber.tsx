import { useEffect, useState } from 'react';

const SPINS = 2;
// One digit past the last cycle so the overshoot in the easing never shows an empty slot.
const STRIP = Array.from({ length: (SPINS + 1) * 10 + 1 }, (_, i) => i % 10);

/** Rolls each digit into place like a slot machine reel, stopping left to right. */
export default function SlotNumber({ value }: { value: number }) {
  const text = value.toLocaleString('en-US');
  const [phase, setPhase] = useState<'start' | 'spin' | 'done'>(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'done' : 'start'
  );

  useEffect(() => {
    if (phase !== 'start') return;
    // Two frames so the reels paint at 0 before the transition to their digit starts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setPhase('spin'));
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  // Once stopped, plain text: a reel at rest can still sit a fraction of a pixel off the line.
  if (phase === 'done') return <span style={styles.number}>{text}</span>;

  const reels = [...text].filter((char) => char >= '0' && char <= '9').length;
  let reel = 0;
  return (
    <span aria-label={text} role="img" style={styles.number}>
      {[...text].map((char, i) => {
        if (char < '0' || char > '9') return <span key={i} aria-hidden="true">{char}</span>;
        const stop = SPINS * 10 + Number(char);
        const index = reel++;
        return (
          <span key={i} aria-hidden="true" style={styles.reel}>
            <span style={styles.sizer}>{char}</span>
            {/* Moved by a share of its own height, so it lands on the digit however the browser rounds line heights. */}
            <span
              onTransitionEnd={index === reels - 1 ? () => setPhase('done') : undefined}
              style={{
                ...styles.strip,
                transform: `translateY(-${phase === 'spin' ? (stop / STRIP.length) * 100 : 0}%)`,
                transition: phase === 'spin' ? `transform ${900 + index * 140}ms cubic-bezier(0.3, 0.9, 0.35, 1.04)` : 'none',
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
    position: 'relative' as const,
    overflow: 'hidden' as const,
  },
  sizer: {
    visibility: 'hidden' as const,
  },
  strip: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    willChange: 'transform' as const,
  },
  digit: {
    display: 'block' as const,
  },
};
