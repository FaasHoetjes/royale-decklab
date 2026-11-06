import { useEffect, useRef, useState } from 'react';
import type { ClanWar } from '../../api';
import { getTheme } from '../../theme';
import { copyText } from '../../lib/clipboard';
import { clanChatReminder } from '../../lib/clanWar';

const COPIED_FOR_MS = 1800;

/** Copies a message for clan chat naming who still has war decks to play today. */
const ClanReminderButton = ({ war }: { war: ClanWar }) => {
  const theme = getTheme();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    },
    []
  );

  const copy = async () => {
    await copyText(clanChatReminder(war));
    setCopied(true);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_FOR_MS);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="mobile-touch-target"
      style={{
        ...styles.button,
        color: copied ? theme.onAccent : theme.text.primary,
        backgroundColor: copied ? 'var(--up)' : theme.bg.tertiary,
        borderColor: copied ? 'var(--up)' : theme.borderStrong,
      }}
    >
      <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {copied ? <path d="m5 12 4 4L19 6" /> : <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />}
      </svg>
      <span aria-live="polite">{copied ? 'Copied for clan chat' : 'Copy reminder for clan chat'}</span>
    </button>
  );
};

export default ClanReminderButton;

const styles = {
  button: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    height: '36px',
    padding: '0 14px',
    border: '1px solid',
    borderRadius: '999px',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    transition: 'background-color 0.2s ease, color 0.2s ease',
  },
  icon: {
    width: '15px',
    height: '15px',
  },
};
