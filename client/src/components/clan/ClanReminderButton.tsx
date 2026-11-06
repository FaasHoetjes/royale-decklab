import { useState } from 'react';
import type { ClanWar } from '../../api';
import { getTheme } from '../../theme';
import ClanReminderSheet from './ClanReminderSheet';

/** A chat icon at the end of today's legend that opens the clan chat reminder. */
const ClanReminderButton = ({ war }: { war: ClanWar }) => {
  const theme = getTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Remind your clan"
        aria-haspopup="dialog"
        title="Remind your clan"
        className="mobile-touch-target"
        style={{ ...styles.button, color: theme.text.primary, backgroundColor: theme.bg.tertiary, borderColor: theme.borderStrong }}
      >
        <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
        </svg>
      </button>
      {open && <ClanReminderSheet war={war} onClose={() => setOpen(false)} />}
    </>
  );
};

export default ClanReminderButton;

const styles = {
  button: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '34px',
    height: '34px',
    padding: 0,
    border: '1px solid',
    borderRadius: '50%',
    cursor: 'pointer' as const,
  },
  icon: {
    width: '16px',
    height: '16px',
  },
};
