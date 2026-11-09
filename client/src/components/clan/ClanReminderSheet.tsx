import { useEffect, useRef, useState } from 'react';
import type { ClanWar } from '../../api';
import { copyText } from '../../lib/clipboard';
import { clanChatReminder, REMINDER_STYLES, reminderStyleLabel, type ReminderStyle } from '../../lib/clanWar';
import { CrossIcon } from '../generator/icons';
import { Segment } from '../generator/SegmentedChoice';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { sheetStyles } from './sheetStyles';

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
  const closeRef = useBottomSheet(onClose);
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

  return (
    <>
      <div className="gc-backdrop" style={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="clan-reminder-title" className="gc-sheet" style={styles.sheet}>
        <div aria-hidden="true" style={styles.handle} />
        <div style={styles.header}>
          <h2 id="clan-reminder-title" style={styles.title}>
            Remind your clan
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="mobile-touch-target" style={styles.close}>
            <CrossIcon size={16} />
          </button>
        </div>

        <Segment label="Message" choices={REMINDER_STYLES} value={style} onPick={pick} text={(s) => reminderStyleLabel[s]} />

        <p style={styles.preview}>{text}</p>

        <div style={styles.actions}>
          <button
            type="button"
            onClick={copy}
            aria-live="polite"
            style={{ ...styles.primary, backgroundColor: copied ? 'var(--up)' : 'var(--accent)' }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canShare() && (
            <button type="button" onClick={share} style={styles.secondary}>
              Share…
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default ClanReminderSheet;

const styles = {
  ...sheetStyles,
  preview: {
    margin: '14px 0 0',
    padding: '12px 14px',
    maxHeight: '40vh',
    overflowY: 'auto' as const,
    borderRadius: '12px',
    backgroundColor: 'var(--bg-tertiary)',
    fontSize: '14px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
    overflowWrap: 'anywhere' as const,
  },
};
