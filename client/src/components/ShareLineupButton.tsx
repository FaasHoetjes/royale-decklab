import { useEffect, useRef, useState } from 'react';
import { copyText } from '../lib/clipboard';

interface ShareLineupButtonProps {
  url: string;
  title: string;
  isMobile: boolean;
}

/** Opens the phone's share sheet, or copies the link on desktop, where the system share dialog is clumsy. */
export default function ShareLineupButton({ url, title, isMobile }: ShareLineupButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const share = async () => {
    if (isMobile && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    await copyText(url);
    setCopied(true);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button type="button" className="glass-btn mobile-touch-target" onClick={share} style={styles.button}>
      {copied ? <CheckIcon /> : <ShareIcon />}
      <span aria-live="polite">{copied ? 'Link copied' : 'Share'}</span>
    </button>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true">
      <path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const styles = {
  button: {
    alignSelf: 'flex-start' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    marginTop: '10px',
    height: '34px',
    padding: '0 13px',
    border: '1px solid color-mix(in srgb, var(--hero-text) 20%, transparent)',
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
    backdropFilter: 'blur(10px)',
    color: 'var(--hero-text)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
  icon: {
    width: '14px',
    height: '14px',
    display: 'block' as const,
    flexShrink: 0,
  },
};
