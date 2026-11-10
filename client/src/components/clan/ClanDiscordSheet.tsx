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
import Sheet from '../Sheet';
import Switch from '../Switch';
import { Segment } from '../generator/SegmentedChoice';
import DiscordPreview from './DiscordPreview';

const HOUR_CHOICES = [1, 2, 3, 6];
const DEFAULT_SETTINGS: ReminderSettings = { hoursBeforeReset: 2, style: 'names', ping: 'nobody', postWhenAllDone: false };

const problemText: Record<ReminderProblem, string> = {
  unavailable: 'Discord reminders are switched off on this server right now.',
  invalidWebhook: "That isn't a Discord webhook URL. Copy it from the channel's Integrations settings.",
  invalidSettings: "These settings didn't save. Reload the page and try again.",
  clanNotFound: "This clan couldn't be found.",
  noResetTime: "This clan hasn't finished a war yet, so its reset time isn't known. Try again after its first war week.",
  webhookNotFound: "Discord doesn't know this webhook. It may have been deleted; make a new one and paste that URL.",
  tooManyReminders: "The site can't take more reminders right now. Try again later.",
  tooManyForServer: 'This Discord server already has the most reminders it can have. Turn one of them off first.',
  notRegistered: "This URL isn't set up for this clan, so there's nothing to turn off.",
  discordFailed: "Discord didn't answer. Try again in a minute.",
  clashRoyaleFailed: "Clash Royale didn't answer, so the clan couldn't be checked. Try again in a minute.",
  busy: 'Lots of clans are setting up reminders right now. Try again in a minute.',
};

const TWO_MINUTES_MS = 120_000;

const errorText = (error: unknown): string => {
  if (!(error instanceof ApiError)) return "Couldn't reach the server. Check your connection and try again.";
  if (error.status === 429) {
    const isLongWait = (error.retryAfterMs ?? 0) > TWO_MINUTES_MS;
    return isLongWait ? 'Too many changes from your connection today. Try again tomorrow.' : 'Too many tries. Wait a minute and try again.';
  }
  const problem = error.code as ReminderProblem | undefined;
  return (problem && problemText[problem]) ?? 'Something went wrong. Try again in a moment.';
};

const postTime = (dayEndsAt: string, hours: number): string =>
  new Date(Date.parse(dayEndsAt) - hours * 3_600_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const pingFor = (isOn: boolean): ReminderPing => (isOn ? 'here' : 'nobody');

export const describeReminder = (settings: ReminderSettings): string => {
  const parts = [`${settings.hoursBeforeReset}h before reset`, reminderStyleLabel[settings.style]];
  if (settings.ping === 'here') parts.push('@here');
  return parts.join(' · ');
};

type Busy = 'save' | 'test' | 'off';
type Notice = { tone: 'ok' | 'error'; text: string };

const StatusCard = ({ reminders, dayEndsAt }: { reminders: ReminderSettings[]; dayEndsAt: string | null }) => {
  const when = (r: ReminderSettings) => (dayEndsAt ? `posts about ${postTime(dayEndsAt, r.hoursBeforeReset)}` : `${r.hoursBeforeReset}h before reset`);
  const summary = (r: ReminderSettings) => [when(r), reminderStyleLabel[r.style], ...(r.ping === 'here' ? ['@here'] : [])].join(' · ');
  const [only] = reminders;
  const isSingle = reminders.length === 1 && only != null;

  return (
    <div style={styles.status}>
      <strong style={styles.statusTitle}>
        <span aria-hidden="true" style={styles.statusDot} />
        {isSingle ? `On · ${summary(only)}` : `On in ${reminders.length} channels`}
      </strong>
      {!isSingle && reminders.map((reminder, i) => <span key={i} style={styles.statusLine}>{summary(reminder)}</span>)}
      <span style={styles.statusLine}>Paste the webhook URL to change or turn it off.</span>
    </div>
  );
};

interface ClanDiscordSheetProps {
  war: ClanWar;
  reminders: ReminderSettings[];
  onClose: () => void;
}

/** Turn on, change or turn off the Discord webhook that reminds the clan before each war day ends. */
const ClanDiscordSheet = ({ war, reminders, onClose }: ClanDiscordSheetProps) => {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState('');
  const [settings, setSettings] = useState<ReminderSettings>(reminders[0] ?? DEFAULT_SETTINGS);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [showsSteps, setShowsSteps] = useState(false);
  const isOn = reminders.length > 0;
  const hasUrl = url.trim().length > 0;
  const isLocked = !hasUrl || busy != null;
  const saveLabel = isOn ? 'Save' : 'Turn on';
  const postsAt = war.dayEndsAt ? postTime(war.dayEndsAt, settings.hoursBeforeReset) : null;

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

  const footer = (
    <>
      <p
        role="status"
        aria-live="polite"
        style={{ ...styles.notice, marginBottom: notice ? '10px' : 0, color: notice?.tone === 'error' ? 'var(--down)' : 'var(--up)' }}
      >
        {notice?.text}
      </p>
      <div className="sheet-actions">
        <button type="button" onClick={test} disabled={isLocked} className="sheet-btn">
          {busy === 'test' ? 'Sending…' : 'Send a test'}
        </button>
        <button type="button" onClick={save} disabled={isLocked} className="sheet-btn sheet-btn-primary">
          {busy === 'save' ? 'Saving…' : saveLabel}
        </button>
      </div>
      {isOn && (
        <button type="button" onClick={turnOff} disabled={isLocked} style={{ ...styles.turnOff, opacity: hasUrl ? 1 : 0.45 }}>
          {busy === 'off' ? 'Turning off…' : 'Turn off reminders'}
        </button>
      )}
    </>
  );

  return (
    <Sheet
      title="Discord reminders"
      icon={<img src="/discord-symbol.svg" alt="" width={26} height={19} style={styles.logo} />}
      footer={footer}
      onClose={onClose}
    >
      {isOn && <StatusCard reminders={reminders} dayEndsAt={war.dayEndsAt} />}

      <div style={styles.previewLabel}>
        <span>Preview</span>
        {postsAt && war.isBattleDay && <span style={styles.previewTime}>{`posts about ${postsAt}`}</span>}
      </div>
      <DiscordPreview war={war} settings={settings} postsAt={postsAt} />

      <label htmlFor="clan-discord-url" style={styles.groupTitle}>
        Discord channel
      </label>
      <div style={styles.group}>
        <div style={styles.row}>
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
          <button
            type="button"
            onClick={() => setShowsSteps((shows) => !shows)}
            aria-expanded={showsSteps}
            aria-controls="clan-discord-steps"
            style={styles.helpToggle}
          >
            {showsSteps ? 'Hide the steps' : 'How do I get this URL?'}
          </button>
          {showsSteps && (
            <div id="clan-discord-steps" style={styles.help}>
              <ol style={styles.steps}>
                <li>In Discord, open the channel's settings, then Integrations.</li>
                <li>Pick Webhooks, then New Webhook, then Copy Webhook URL.</li>
              </ol>
              <span>You need the Manage Webhooks permission in that server.</span>
            </div>
          )}
        </div>
      </div>

      <h3 style={styles.groupTitle}>When and what</h3>
      <div style={styles.group}>
        <div style={styles.row}>
          <div style={styles.rowLine}>
            <span style={styles.rowLabel}>Before the day ends</span>
            {postsAt && <span style={styles.rowSub}>{`about ${postsAt}`}</span>}
          </div>
          <Segment
            label="Before the day ends"
            choices={HOUR_CHOICES}
            value={settings.hoursBeforeReset}
            onPick={(hours) => change({ hoursBeforeReset: hours })}
            text={(hours) => `${hours}h`}
            ariaLabel={(hours) => `${hours} ${hours === 1 ? 'hour' : 'hours'} before the war day ends`}
          />
        </div>
        <div style={{ ...styles.row, ...styles.rowDivider }}>
          <span style={styles.rowLabel}>Message</span>
          <Segment label="Message" choices={REMINDER_STYLES} value={settings.style} onPick={(style) => change({ style })} text={(s) => reminderStyleLabel[s]} />
        </div>
        <label style={{ ...styles.row, ...styles.rowDivider, ...styles.rowLine, ...styles.clickable }}>
          <span style={styles.rowLabel}>Ping @here</span>
          <Switch isOn={settings.ping === 'here'} onChange={(isOn) => change({ ping: pingFor(isOn) })} />
        </label>
        <label style={{ ...styles.row, ...styles.rowDivider, ...styles.rowLine, ...styles.clickable }}>
          <span>
            <span style={styles.rowLabel}>Also post when all done</span>
            <span style={styles.rowSubBlock}>A short “every deck played” post</span>
          </span>
          <Switch isOn={settings.postWhenAllDone} onChange={(postWhenAllDone) => change({ postWhenAllDone })} />
        </label>
      </div>

      <p style={styles.privacy}>
        The webhook's secret part is stored encrypted and only used to post these reminders. Deleting the webhook in Discord stops them too.
      </p>
    </Sheet>
  );
};

export default ClanDiscordSheet;

const styles = {
  logo: {
    flexShrink: 0,
  },
  status: {
    display: 'grid' as const,
    gap: '2px',
    marginTop: '6px',
    padding: '12px 14px',
    borderRadius: '14px',
    backgroundColor: 'color-mix(in srgb, var(--up) 12%, transparent)',
    border: '1px solid color-mix(in srgb, var(--up) 30%, transparent)',
  },
  statusTitle: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    fontSize: '15px',
  },
  statusDot: {
    flexShrink: 0,
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: 'var(--up)',
  },
  statusLine: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  previewLabel: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    margin: '14px 4px 0',
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  previewTime: {
    fontWeight: 500 as const,
  },
  groupTitle: {
    display: 'block' as const,
    margin: '18px 4px 6px',
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  group: {
    borderRadius: '14px',
    backgroundColor: 'var(--bg-tertiary)',
    overflow: 'hidden' as const,
  },
  row: {
    display: 'grid' as const,
    gap: '8px',
    padding: '12px 14px',
  },
  rowDivider: {
    borderTop: '1px solid var(--border)',
  },
  rowLine: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
  },
  clickable: {
    cursor: 'pointer',
  },
  rowLabel: {
    fontSize: '15px',
    fontWeight: 500 as const,
  },
  rowSub: {
    fontSize: '12.5px',
    color: 'var(--text-secondary)',
  },
  rowSubBlock: {
    display: 'block' as const,
    fontSize: '12.5px',
    color: 'var(--text-secondary)',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '12px',
    border: '1px solid var(--control-border)',
    borderRadius: '10px',
    backgroundColor: 'var(--control-bg)',
    color: 'var(--text-primary)',
    fontSize: '16px',
  },
  helpToggle: {
    justifySelf: 'start' as const,
    padding: 0,
    border: 0,
    background: 'none',
    color: 'var(--accent)',
    fontSize: '14px',
    fontWeight: 600 as const,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  help: {
    display: 'grid' as const,
    gap: '6px',
    fontSize: '13.5px',
    color: 'var(--text-secondary)',
  },
  steps: {
    display: 'grid' as const,
    gap: '3px',
    margin: 0,
    paddingLeft: '18px',
  },
  privacy: {
    margin: '14px 4px 0',
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'var(--text-tertiary)',
  },
  notice: {
    margin: 0,
    fontSize: '13px',
  },
  turnOff: {
    display: 'block' as const,
    width: '100%',
    marginTop: '6px',
    padding: '6px',
    border: 0,
    background: 'none',
    color: 'var(--down)',
    fontSize: '15px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
