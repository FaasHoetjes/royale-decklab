import type { CSSProperties } from 'react';

interface Props {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  retryLabel?: string;
  style?: CSSProperties;
}

export default function LoadError({ title, message, onRetry, retrying = false, retryLabel = 'Try again', style }: Props) {
  return (
    <div style={{ ...styles.container, ...style }} role="alert">
      <span style={styles.iconWrap}>
        <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 7.5v5.5" />
          <path d="M12 16.5h.01" />
        </svg>
      </span>
      <h3 style={styles.title}>{title}</h3>
      <p style={styles.message}>{message}</p>
      <button
        type="button"
        className="mobile-touch-target"
        onClick={onRetry}
        disabled={retrying}
        style={{ ...styles.button, cursor: retrying ? 'wait' : 'pointer', opacity: retrying ? 0.7 : 1 }}
      >
        {retrying ? 'Retrying…' : retryLabel}
      </button>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '440px',
    minHeight: '55dvh',
    margin: '0 auto',
    padding: '32px 16px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    textAlign: 'center' as const,
  },
  iconWrap: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)',
    color: 'var(--accent)',
  },
  icon: {
    width: '28px',
    height: '28px',
    display: 'block' as const,
  },
  title: {
    margin: '16px 0 0',
    fontSize: '18px',
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
  },
  message: {
    margin: '8px 0 0',
    fontSize: '15px',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
  },
  button: {
    marginTop: '20px',
    padding: '10px 22px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: 600 as const,
  },
};
