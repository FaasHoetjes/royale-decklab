import type { ClanWar, ClanWarMember, ReminderSettings } from '../../api';
import { dayLabel, DECKS_PER_DAY } from '../../lib/clanWar';

const NAMES_SHOWN = 5;
const EXAMPLE_DECKS_USED = [0, 4, 2, 4, 4, 0, 4, 3, 4, 4];
const OPEN_COLOR = '#e8b24a';
const DONE_COLOR = '#22c55e';

interface Field {
  name: string;
  value: string;
}

interface Embed {
  title: string;
  description: string;
  fields: Field[];
  color: string;
  hasPlannerLink: boolean;
}

/** Sorts like the server's OrdinalIgnoreCase, so the preview lists names in the order the post will. */
const byNameIgnoringCase = (a: ClanWarMember, b: ClanWarMember): number => {
  const left = a.name.toUpperCase();
  const right = b.name.toUpperCase();
  if (left === right) return 0;
  return left < right ? -1 : 1;
};

const byDecksLeftThenName = (a: ClanWarMember, b: ClanWarMember): number =>
  b.decksLeftToday - a.decksLeftToday || byNameIgnoringCase(a, b);

const shortList = (names: string[]): string =>
  names.length > NAMES_SHOWN ? `${names.slice(0, NAMES_SHOWN).join(', ')} +${names.length - NAMES_SHOWN}` : names.join(', ');

const dayEnds = (hours: number): string => (hours === 1 ? 'Day ends in an hour.' : `Day ends in ${hours} hours.`);

const counts = (notStarted: number, started: number): string => {
  const parts: string[] = [];
  if (notStarted > 0) parts.push(`${notStarted} ${notStarted === 1 ? "hasn't" : "haven't"} played yet`);
  if (started > 0) parts.push(`${started} ${started === 1 ? 'is' : 'are'} halfway`);
  return `${parts.join(', ')}.`;
};

/** The same embed the server builds in ReminderMessage.cs, from today's war as it stands now. */
const openEmbed = (war: ClanWar, settings: ReminderSettings): Embed => {
  const open = war.members.filter((m) => m.decksLeftToday > 0);
  const notStarted = open.filter((m) => m.decksUsedToday === 0).sort(byNameIgnoringCase);
  const started = open.filter((m) => m.decksUsedToday > 0).sort(byDecksLeftThenName);
  const left = war.decksLeftToday;
  const title = `${dayLabel(war)} · ${left} ${left === 1 ? 'deck' : 'decks'} still open`;
  const base = { title, color: OPEN_COLOR, hasPlannerLink: true };

  switch (settings.style) {
    case 'short':
      return { ...base, description: `${dayEnds(settings.hoursBeforeReset)} ${counts(notStarted.length, started.length)}`, fields: [] };
    case 'names': {
      const field = notStarted.length > 0
        ? { name: 'Not played yet', value: shortList(notStarted.map((m) => m.name)) }
        : { name: 'Still to finish', value: shortList(started.map((m) => m.name)) };
      return { ...base, description: dayEnds(settings.hoursBeforeReset), fields: [field] };
    }
    case 'full': {
      const fields: Field[] = [];
      if (notStarted.length > 0) fields.push({ name: `Not played yet (${notStarted.length})`, value: notStarted.map((m) => m.name).join(', ') });
      if (started.length > 0) fields.push({ name: 'Decks left to finish', value: started.map((m) => `${m.name} ${m.decksLeftToday}`).join(' · ') });
      return { ...base, description: dayEnds(settings.hoursBeforeReset), fields };
    }
  }
};

const allDoneEmbed = (war: ClanWar): Embed => ({
  title: `${dayLabel(war)} · every deck played 🎉`,
  description: `All ${war.members.length} members played their ${DECKS_PER_DAY} decks today.`,
  fields: [],
  color: DONE_COLOR,
  hasPlannerLink: false,
});

/** The clan's own members on a made-up war day, a few with decks left, so every message style has names to show. */
const exampleWar = (war: ClanWar): ClanWar => {
  const members = war.members.map((member, i) => {
    const used = EXAMPLE_DECKS_USED[i % EXAMPLE_DECKS_USED.length] ?? DECKS_PER_DAY;
    return { ...member, decksUsedToday: used, decksLeftToday: DECKS_PER_DAY - used };
  });
  return {
    ...war,
    period: 'warDay',
    day: 1,
    isBattleDay: true,
    members,
    decksLeftToday: members.reduce((sum, m) => sum + m.decksLeftToday, 0),
    membersDoneToday: members.filter((m) => m.decksLeftToday === 0).length,
  };
};

interface DiscordPreviewProps {
  war: ClanWar;
  settings: ReminderSettings;
  postsAt: string | null;
}

/**
 * The reminder as it would look in a Discord channel, so the settings can be judged by what they post. Today's war
 * when today would post; otherwise an example war day with the clan's members.
 */
const DiscordPreview = ({ war, settings, postsAt }: DiscordPreviewProps) => {
  const isAllDoneToday = war.isBattleDay && war.decksLeftToday === 0;
  const isToday = war.isBattleDay && (!isAllDoneToday || settings.postWhenAllDone);
  const shown = isToday ? war : exampleWar(war);
  const showsAllDone = isAllDoneToday && isToday;
  const embed = showsAllDone ? allDoneEmbed(war) : openEmbed(shown, settings);
  const label = isToday ? (postsAt ? `Today · posts about ${postsAt}` : 'Today') : 'Example war day';

  return (
    <>
      <div style={styles.label}>
        <span>Preview</span>
        <span style={styles.labelSide}>{label}</span>
      </div>
      <Message embed={embed} settings={settings} postsAt={postsAt} ariaLabel="Preview of the Discord post" />
      {settings.postWhenAllDone && !showsAllDone && (
        <>
          <div style={styles.label}>
            <span>If everyone's done by then</span>
          </div>
          <Message embed={allDoneEmbed(shown)} settings={settings} postsAt={postsAt} ariaLabel="Preview of the post when everyone's done" />
        </>
      )}
      {isAllDoneToday && !isToday && (
        <p style={styles.note}>Everyone has played today, so nothing posts today. Turn on “Celebrate if everyone's done” to post anyway.</p>
      )}
    </>
  );
};

export default DiscordPreview;

interface MessageProps {
  embed: Embed;
  settings: ReminderSettings;
  postsAt: string | null;
  ariaLabel: string;
}

const Message = ({ embed, settings, postsAt, ariaLabel }: MessageProps) => (
  <div style={styles.message} aria-label={ariaLabel}>
    <span aria-hidden="true" style={styles.avatar}>DL</span>
    <div style={styles.main}>
      <div style={styles.author}>
        Royale DeckLab
        <span style={styles.app}>APP</span>
        {postsAt && <span style={styles.time}>{`Today at ${postsAt}`}</span>}
      </div>
      {settings.ping === 'here' && <span style={styles.mention}>@here</span>}
      <div style={{ ...styles.embed, borderLeft: `4px solid ${embed.color}` }}>
        <div style={styles.embedTitle}>{embed.title}</div>
        <div>{embed.description}</div>
        {embed.fields.map((field) => (
          <div key={field.name}>
            <div style={styles.fieldName}>{field.name}</div>
            <div style={styles.fieldValue}>{field.value}</div>
          </div>
        ))}
        {embed.hasPlannerLink && <div style={styles.link}>Everyone's status and best decks</div>}
        <div style={styles.footer}>royaledecklab.com</div>
      </div>
    </div>
  </div>
);

const styles = {
  label: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    margin: '18px 4px 0',
    fontSize: '13px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
  labelSide: {
    fontWeight: 500 as const,
  },
  note: {
    margin: '8px 4px 0',
    fontSize: '12.5px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  message: {
    display: 'flex' as const,
    gap: '10px',
    marginTop: '6px',
    padding: '12px 12px 14px',
    borderRadius: '14px',
    backgroundColor: '#313338',
    color: '#dbdee1',
    fontSize: '14px',
    lineHeight: 1.4,
  },
  avatar: {
    display: 'grid' as const,
    placeItems: 'center' as const,
    flex: '0 0 auto',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: OPEN_COLOR,
    color: '#1a1407',
    fontSize: '13px',
    fontWeight: 800 as const,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  author: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: '6px',
    color: '#f2f3f5',
    fontSize: '14.5px',
    fontWeight: 600 as const,
  },
  app: {
    padding: '0 4px',
    borderRadius: '3px',
    backgroundColor: '#5865f2',
    color: '#ffffff',
    fontSize: '10px',
    fontWeight: 700 as const,
  },
  time: {
    color: '#949ba4',
    fontSize: '11.5px',
    fontWeight: 400 as const,
  },
  mention: {
    display: 'inline-block' as const,
    marginTop: '2px',
    padding: '0 3px',
    borderRadius: '3px',
    backgroundColor: 'rgba(88, 101, 242, 0.3)',
    color: '#c9cdfb',
    fontWeight: 500 as const,
  },
  embed: {
    display: 'grid' as const,
    gap: '6px',
    marginTop: '6px',
    padding: '9px 12px 10px',
    borderRadius: '4px',
    backgroundColor: '#2b2d31',
    overflowWrap: 'anywhere' as const,
  },
  embedTitle: {
    color: '#00a8fc',
    fontWeight: 600 as const,
  },
  fieldName: {
    color: '#f2f3f5',
    fontSize: '13px',
    fontWeight: 600 as const,
  },
  fieldValue: {
    fontSize: '13.5px',
  },
  link: {
    color: '#00a8fc',
  },
  footer: {
    color: '#949ba4',
    fontSize: '11.5px',
  },
};
