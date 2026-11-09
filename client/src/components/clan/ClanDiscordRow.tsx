import { useState } from 'react';
import type { ClanWar, ReminderSettings } from '../../api';
import { useClanReminders } from '../../queries';
import ClanDiscordSheet, { describeReminder } from './ClanDiscordSheet';

const summary = (count: number, first: ReminderSettings | undefined): string => {
  if (first == null) return 'Post who still has decks, every war day';
  return count === 1 ? `On · ${describeReminder(first)}` : `On in ${count} channels`;
};

/** A row under the banner that sets up Discord reminders; hidden when the server has them switched off. */
const ClanDiscordRow = ({ war }: { war: ClanWar }) => {
  const reminders = useClanReminders(war.tag);
  const [open, setOpen] = useState(false);

  if (!reminders.data?.isAvailable) return null;
  const list = reminders.data.reminders;
  const isOn = list.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          ...styles.row,
          border: isOn ? '1px solid var(--border)' : '1px dashed var(--border-strong)',
        }}
      >
        <img src="/discord-symbol.svg" alt="" width={26} height={19} style={styles.logo} />
        <span style={styles.text}>
          <span style={styles.title}>Discord reminders</span>
          <span style={{ ...styles.sub, color: isOn ? 'var(--up)' : 'var(--text-secondary)' }}>{summary(list.length, list[0])}</span>
        </span>
      </button>
      {open && <ClanDiscordSheet war={war} reminders={list} onClose={() => setOpen(false)} />}
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
  },
};
