import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  deleteClanReminder,
  saveClanReminder,
  testClanReminder,
  type ClanWar,
  type ReminderPing,
  type ReminderProblem,
  type ReminderSettings,
} from '../../api';
import { queryKeys } from '../../queries';
import { REMINDER_STYLES, reminderStyleLabel } from '../../lib/clanWar';
import { useBottomSheet } from '../../hooks/useBottomSheet';
import { CrossIcon } from '../generator/icons';
import { Segment } from '../generator/SegmentedChoice';
import { sheetStyles } from './sheetStyles';

const HOUR_CHOICES = [1, 2, 3, 6];
const PINGS: ReminderPing[] = ['nobody', 'here'];
const pingLabel: Record<ReminderPing, string> = { nobody: 'Nobody', here: '@here' };
const DEFAULT_SETTINGS: ReminderSettings = { hoursBeforeReset: 2, style: 'names', ping: 'nobody', postWhenAllDone: false };

const problemText: Record<ReminderProblem, string> = {
  unavailable: 'Discord reminders are switched off on this server right now.',
  invalidWebhook: "That isn't a Discord webhook URL. Copy it from the channel's Integrations settings.",
  invalidSettings: "These settings didn't save. Reload the page and try again.",
  clanNotFound: "This clan couldn't be found.",
  noResetTime: "This clan hasn't finished a war yet, so its reset time isn't known. Try again after its first war week.",
  webhookNotFound: "Discord doesn't know this webhook. It may have been deleted; make a new one and paste that URL.",
  tooManyReminders: "There's no room for another reminder. Turn an old one off first.",
  notRegistered: "This URL isn't set up for this clan, so there's nothing to turn off.",
  discordFailed: "Discord didn't take the message. Try again in a minute.",
};

const errorText = (error: unknown): string => {
  if (!(error instanceof ApiError)) return "Couldn't reach the server. Check your connection and try again.";
  if (error.status === 429) return 'Too many tries. Wait a minute and try again.';
  const problem = error.code as ReminderProblem | undefined;
  return (problem && problemText[problem]) ?? 'Something went wrong. Try again in a moment.';
};

const postTime = (dayEndsAt: string, hours: number): string =>
  new Date(Date.parse(dayEndsAt) - hours * 3_600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const describeReminder = (settings: ReminderSettings): string => {
  const parts = [`${settings.hoursBeforeReset}h before reset`, reminderStyleLabel[settings.style]];
  if (settings.ping === 'here') parts.push('@here');
  return parts.join(' · ');
};

type Busy = 'save' | 'test' | 'off';
type Notice = { tone: 'ok' | 'error'; text: string };

interface ClanDiscordSheetProps {
  war: ClanWar;
  reminders: ReminderSettings[];
  onClose: () => void;
}

/** Turn on, change or turn off the Discord webhook that reminds the clan before each war day ends. */
const ClanDiscordSheet = ({ war, reminders, onClose }: ClanDiscordSheetProps) => {
  const closeRef = useBottomSheet(onClose);
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [settings, setSettings] = useState<ReminderSettings>(reminders[0] ?? DEFAULT_SETTINGS);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const isOn = reminders.length > 0;
  const hasUrl = url.trim().length > 0;

  const change = (next: Partial<ReminderSettings>) => {
    setSettings((current) => ({ ...current, ...next }));
    setNotice(null);
  };

  const run = async (kind: Busy, action: () => Promise<string>) => {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ tone: 'ok', text: await action() });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(null);
    }
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.clanReminders(war.tag) });

  const save = () => run('save', async () => {
    const webhookName = await saveClanReminder(war.tag, url.trim(), settings);
    await refresh();
    return webhookName ? `Reminders are on. They post as “${webhookName}”.` : 'Reminders are on.';
  });

  const test = () => run('test', async () => {
    await testClanReminder(war.tag, url.trim(), settings);
    return 'Test sent. Check your Discord channel.';
  });

  const turnOff = () => run('off', async () => {
    await deleteClanReminder(war.tag, url.trim());
    await refresh();
    setUrl('');
    return 'Reminders are off for this webhook.';
  });

  return (
    <>
      <div className="gc-backdrop" style={styles.backdrop} onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="clan-discord-title" className="gc-sheet" style={styles.sheet}>
        <div aria-hidden="true" style={styles.handle} />
        <div style={styles.header}>
          <h2 id="clan-discord-title" style={styles.title}>
            Discord reminders
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="mobile-touch-target" style={styles.close}>
            <CrossIcon size={16} />
          </button>
        </div>

        {isOn && (
          <div style={styles.status}>
            <strong style={styles.statusTitle}>{reminders.length === 1 ? 'On for this clan' : `On in ${reminders.length} channels`}</strong>
            {reminders.map((reminder, i) => (
              <span key={i} style={styles.hint}>{describeReminder(reminder)}</span>
            ))}
          </div>
        )}

        <label htmlFor="clan-discord-url" style={styles.label}>
          {isOn ? 'Webhook URL (paste it again to change or turn off)' : 'Webhook URL'}
        </label>
        <input
          id="clan-discord-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setNotice(null);
          }}
          placeholder="https://discord.com/api/webhooks/…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          style={styles.input}
        />
        <details style={styles.help}>
          <summary style={styles.helpSummary}>Where do I find this?</summary>
          <ol style={styles.steps}>
            <li>In Discord, open the channel's settings and go to Integrations.</li>
            <li>Pick Webhooks, then New Webhook, then Copy Webhook URL.</li>
          </ol>
          <p style={styles.helpNote}>You need the Manage Webhooks permission in that server.</p>
        </details>

        <p style={styles.label}>When</p>
        <Segment
          label="When"
          choices={HOUR_CHOICES}
          value={settings.hoursBeforeReset}
          onPick={(hours) => change({ hoursBeforeReset: hours })}
          text={(hours) => `${hours}h`}
          ariaLabel={(hours) => `${hours} ${hours === 1 ? 'hour' : 'hours'} before the war day ends`}
        />
        <p style={styles.hint}>
          {`Posts ${settings.hoursBeforeReset}h before each war day ends`}
          {war.dayEndsAt && `, about ${postTime(war.dayEndsAt, settings.hoursBeforeReset)} your time`}
        </p>

        <p style={styles.label}>Message</p>
        <Segment label="Message" choices={REMINDER_STYLES} value={settings.style} onPick={(style) => change({ style })} text={(s) => reminderStyleLabel[s]} />

        <p style={styles.label}>Ping</p>
        <Segment label="Ping" choices={PINGS} value={settings.ping} onPick={(ping) => change({ ping })} text={(p) => pingLabel[p]} />

        <label style={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.postWhenAllDone}
            onChange={(e) => change({ postWhenAllDone: e.target.checked })}
            style={styles.checkbox}
          />
          Also post when everyone already played
        </label>

        <p role="status" aria-live="polite" style={{ ...styles.notice, color: notice?.tone === 'error' ? 'var(--down)' : 'var(--up)' }}>
          {notice?.text}
        </p>

        <div style={styles.actions}>
          <button type="button" onClick={test} disabled={!hasUrl || busy != null} style={{ ...styles.secondary, opacity: hasUrl ? 1 : 0.5 }}>
            {busy === 'test' ? 'Sending…' : 'Send a test'}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!hasUrl || busy != null}
            style={{ ...styles.primary, backgroundColor: 'var(--accent)', opacity: hasUrl ? 1 : 0.5 }}
          >
            {busy === 'save' ? 'Saving…' : isOn ? 'Save' : 'Turn on'}
          </button>
        </div>
        {isOn && (
          <button type="button" onClick={turnOff} disabled={!hasUrl || busy != null} style={{ ...styles.turnOff, opacity: hasUrl ? 1 : 0.5 }}>
            {busy === 'off' ? 'Turning off…' : 'Turn off'}
          </button>
        )}

        <p style={styles.privacy}>
          The URL is stored encrypted and only used to post these reminders. Deleting the webhook in Discord stops them too.
        </p>
      </div>
    </>
  );
};

export default ClanDiscordSheet;

const styles = {
  ...sheetStyles,
  status: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '2px',
    marginBottom: '14px',
    padding: '12px 14px',
    borderRadius: '12px',
    backgroundColor: 'var(--bg-tertiary)',
  },
  statusTitle: {
    fontSize: '14px',
  },
  label: {
    display: 'block' as const,
    margin: '14px 0 6px',
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '11px 12px',
    border: '1px solid var(--control-border)',
    borderRadius: '10px',
    backgroundColor: 'var(--control-bg)',
    color: 'var(--text-primary)',
    fontSize: '16px',
  },
  help: {
    marginTop: '8px',
    padding: '10px 12px',
    borderRadius: '10px',
    backgroundColor: 'var(--bg-tertiary)',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  helpSummary: {
    cursor: 'pointer',
    fontWeight: 600 as const,
  },
  steps: {
    margin: '8px 0 0',
    paddingLeft: '18px',
    lineHeight: 1.5,
  },
  helpNote: {
    margin: '6px 0 0',
  },
  hint: {
    margin: '6px 0 0',
    fontSize: '12px',
    color: 'var(--text-secondary)',
  },
  toggle: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    marginTop: '16px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    margin: 0,
    accentColor: 'var(--accent)',
  },
  notice: {
    minHeight: '18px',
    margin: '14px 0 0',
    fontSize: '13px',
  },
  turnOff: {
    display: 'block' as const,
    width: '100%',
    marginTop: '10px',
    padding: '10px',
    border: 0,
    background: 'none',
    color: 'var(--down)',
    fontSize: '15px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
  privacy: {
    margin: '14px 0 0',
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'var(--text-tertiary)',
  },
};
