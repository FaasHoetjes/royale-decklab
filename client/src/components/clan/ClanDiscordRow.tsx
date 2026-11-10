import { useState } from 'react';
import type { ClanWar } from '../../api';
import { useClanReminders } from '../../queries';
import ClanDiscordSheet from './ClanDiscordSheet';

/** A row under the banner that sets up Discord reminders; hidden when the server has them switched off. */
const ClanDiscordRow = ({ war }: { war: ClanWar }) => {
  const reminders = useClanReminders(war.tag);
  const [open, setOpen] = useState(false);

  if (!reminders.data?.isAvailable) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={styles.row}
      >
        <img src="/discord-symbol.svg" alt="" width={26} height={19} style={styles.logo} />
        <span style={styles.text}>
          <span style={styles.title}>Turn on Discord reminders</span>
          <span style={styles.sub}>Ping your clan before the war day ends</span>
        </span>
      </button>
      {open && <ClanDiscordSheet war={war} onClose={() => setOpen(false)} />}
    </>
  );
};

export default ClanDiscordRow;

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    width: '100%',
    margin: '-8px 0 22px',
    padding: '10px 14px',
    border: '1px dashed var(--border-strong)',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  logo: {
    flexShrink: 0,
    margin: '0 2px',
  },
  text: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minWidth: 0,
  },
  title: {
    fontSize: '14px',
    fontWeight: 700 as const,
  },
  sub: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
};
