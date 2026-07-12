import { useEffect, useRef, useState, type CSSProperties } from 'react';

interface DeckLinkActionProps {
  link: string;
  isMobile: boolean;
  style: CSSProperties;
  className?: string;
  label?: string;
}

export default function DeckLinkAction({
  link,
  isMobile,
  style,
  className,
  label,
}: DeckLinkActionProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    []
  );

  if (isMobile) {
    return (
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        title="Open this deck in Clash Royale"
        aria-label="Open this deck in Clash Royale"
        style={{ ...style, fontFamily: 'inherit' }}
      >
        <PlayIcon />
        {label}
      </a>
    );
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }

    setCopied(true);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={copyLink}
      className={className}
      title={copied ? 'Deck link copied' : 'Copy deck link'}
      aria-label={copied ? 'Deck link copied' : 'Copy deck link'}
      style={{ ...style, fontFamily: 'inherit' }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {label && (copied ? 'Copied' : label)}
    </button>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true">
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" strokeWidth="2" />
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
  icon: {
    width: '15px',
    height: '15px',
    display: 'block',
    flexShrink: 0,
  },
};
