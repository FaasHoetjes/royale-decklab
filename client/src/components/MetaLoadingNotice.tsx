import { useMetaLoading } from '../queries';

/** Explains the empty page during the few minutes the server needs to reload the meta after an update. */
export default function MetaLoadingNotice() {
  if (!useMetaLoading()) return null;
  return (
    <div role="status" style={styles.notice}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={styles.icon}>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
      <span>
        <strong style={styles.title}>Royale DeckLab was just updated.</strong> It's reloading the war stats, which takes a few
        minutes. This page fills in by itself.
      </span>
    </div>
  );
}

const styles = {
  notice: {
    display: 'flex' as const,
    alignItems: 'flex-start' as const,
    gap: '10px',
    marginBottom: '16px',
    padding: '12px 14px',
    borderRadius: '10px',
    backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)',
    color: 'var(--text-secondary)',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  icon: {
    flexShrink: 0,
    marginTop: '1px',
    color: 'var(--accent)',
  },
  title: {
    color: 'var(--text-primary)',
    fontWeight: 600 as const,
  },
};
