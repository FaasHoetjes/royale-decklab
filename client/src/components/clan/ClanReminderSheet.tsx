import { useEffect, useRef, useState } from 'react';
import type { ClanWar } from '../../api';
import { copyText } from '../../lib/clipboard';
import { clanChatReminder, REMINDER_STYLES, reminderStyleLabel, type ReminderStyle } from '../../lib/clanWar';
import Sheet from '../Sheet';
import { Segment } from '../generator/SegmentedChoice';

const STYLE_KEY = 'clanReminderStyle';
const COPIED_FOR_MS = 1800;

const loadStyle = (): ReminderStyle => {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    return REMINDER_STYLES.find((style) => style === saved) ?? 'short';
  } catch {
    return 'short';
  }
};

const saveStyle = (style: ReminderStyle) => {
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // Blocked storage only means the pick isn't remembered next time.
  }
};

const canShare = () => typeof navigator.share === 'function';

/** Pick how much the clan chat reminder says, see it, then copy it or hand it to the phone's share menu. */
const ClanReminderSheet = ({ war, onClose }: { war: ClanWar; onClose: () => void }) => {
  const [style, setStyle] = useState(loadStyle);
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);
  const text = clanChatReminder(war, style);

  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
  }, []);

  const pick = (next: ReminderStyle) => {
    setStyle(next);
    setCopied(false);
    saveStyle(next);
  };

  const copy = async () => {
    if (!await copyText(text)) return;
    setCopied(true);
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), COPIED_FOR_MS);
  };

  const share = async () => {
    try {
      await navigator.share({ text });
    } catch {
      // Closing the share menu without picking an app rejects; there's nothing to undo.
    }
  };

  const footer = (
    <div className="sheet-actions">
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
        className="sheet-btn sheet-btn-primary"
        style={copied ? styles.copied : undefined}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      {canShare() && (
        <button type="button" onClick={share} className="sheet-btn">
          Share…
        </button>
      )}
    </div>
  );

  return (
    <Sheet title="Remind your clan" footer={footer} onClose={onClose}>
      <div style={styles.choice}>
        <Segment label="Message" choices={REMINDER_STYLES} value={style} onPick={pick} text={(s) => reminderStyleLabel[s]} />
      </div>
      <p style={styles.preview}>{text}</p>
    </Sheet>
  );
};

export default ClanReminderSheet;

const styles = {
  choice: {
    marginTop: '6px',
  },
  copied: {
    backgroundColor: 'var(--up)',
  },
  preview: {
    margin: '14px 0 0',
    padding: '12px 14px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-tertiary)',
    fontSize: '14px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  },
};
