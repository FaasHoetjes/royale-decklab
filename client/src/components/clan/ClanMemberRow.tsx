import { Link } from 'react-router-dom';
import type { ClanWar, ClanWarMember } from '../../api';
import { getTheme } from '../../theme';
import { ZapIcon } from '../navIcons';
import MedalIcon from './MedalIcon';
import {
  DECKS_PER_DAY,
  DECKS_PER_WEEK,
  decksAvailableThisWeek,
  pastWeekBars,
  reliability,
  reliabilityLabel,
  roleLabel,
  type Reliability,
} from '../../lib/clanWar';

interface ClanMemberRowProps {
  member: ClanWarMember;
  war: ClanWar;
  isMobile: boolean;
  isYou: boolean;
}

export const reliabilityColor: Record<Reliability, string> = {
  reliable: 'var(--up)',
  steady: 'var(--text-secondary)',
  slipping: 'var(--warn)',
  ghost: 'var(--down)',
  new: 'var(--info)',
};

const progressNote = (war: ClanWar, member: ClanWarMember): string => {
  if (war.isBattleDay) return `${member.decksUsedThisWeek}/${decksAvailableThisWeek(war)} this week`;
  if (war.pastWeeks.length === 0) return '';
  const lastWeekDecks = member.decksUsedPastWeeks[0];
  if (war.period === 'notRacing') {
    return lastWeekDecks == null ? 'joined since the last race' : `${lastWeekDecks}/${DECKS_PER_WEEK} in the last race`;
  }
  return lastWeekDecks == null ? 'joined since last week' : `${lastWeekDecks}/${DECKS_PER_WEEK} last week`;
};

const medalsNote = (war: ClanWar, member: ClanWarMember): string => {
  const medals = war.isBattleDay ? member.fame : (member.famePastWeeks[0] ?? 0);
  return medals.toLocaleString('en-US');
};

const ClanMemberRow = ({ member, war, isMobile, isYou }: ClanMemberRowProps) => {
  const theme = getTheme();
  const role = roleLabel(member.role);
  const bars = pastWeekBars(war, member);
  const isDone = war.isBattleDay && member.decksLeftToday === 0;
  const playerPath = `/${member.tag.replace('#', '')}`;

  const today = war.isBattleDay && (
    <div style={styles.today} aria-label={`${member.decksUsedToday} of ${DECKS_PER_DAY} decks played today`}>
      <div style={styles.pips} aria-hidden="true">
        {Array.from({ length: DECKS_PER_DAY }, (_, i) => (
          <span
            key={i}
            style={{
              ...styles.pip,
              backgroundColor: i < member.decksUsedToday ? 'var(--up)' : 'transparent',
              borderColor: i < member.decksUsedToday ? 'var(--up)' : theme.borderStrong,
            }}
          />
        ))}
      </div>
      <span style={{ ...styles.todayLabel, color: isDone ? theme.text.secondary : theme.text.primary }}>
        {isDone ? 'Done' : `${member.decksLeftToday} left`}
      </span>
    </div>
  );

  const weeks = bars.map((bar) => `${bar.label}: ${bar.decks == null ? 'not in the clan' : `${bar.decks}/${DECKS_PER_WEEK}`}`).join(', ');
  const badge = reliability(member);
  const reliabilityBadge = bars.length > 0 && war.period !== 'notRacing' && (
    <span
      tabIndex={0}
      title={weeks}
      aria-label={`${reliabilityLabel[badge]}. ${weeks}`}
      style={{
        ...styles.badge,
        color: reliabilityColor[badge],
        backgroundColor: `color-mix(in srgb, ${reliabilityColor[badge]} 14%, transparent)`,
      }}
    >
      {reliabilityLabel[badge]}
    </span>
  );

  return (
    <li
      className={isYou ? 'clan-you' : undefined}
      style={{
        ...styles.row,
        ...(isYou ? styles.you : {}),
        borderBottomColor: theme.border,
        gap: isMobile ? '10px' : '16px',
      }}
    >
      <div style={styles.who}>
        <span style={styles.nameLine}>
          <span style={{ ...styles.name, color: theme.text.primary }}>{member.name}</span>
          {reliabilityBadge}
          {isYou && <span style={{ ...styles.role, ...styles.youTag, color: theme.onAccent, backgroundColor: theme.accent }}>You</span>}
          {role && <span style={{ ...styles.role, color: theme.text.secondary, borderColor: theme.border }}>{role}</span>}
        </span>
        <span style={{ ...styles.meta, color: theme.text.secondary }}>
          <span title={war.isBattleDay ? 'Medals this week' : 'Medals in the last race'} aria-label={`${medalsNote(war, member)} medals ${war.isBattleDay ? 'this week' : 'in the last race'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><MedalIcon />{medalsNote(war, member)}</span>
          <span>{progressNote(war, member) && `· ${progressNote(war, member)}`}</span>
        </span>
      </div>
      {today}
      <Link
        to={playerPath}
        state={{ fromClan: true }}
        className="mobile-touch-target"
        aria-label={`${member.name}'s best war decks`}
        title="Generate best war decks for this member"
        style={{ ...styles.decksLink, color: theme.accent }}
      >
        <span aria-hidden="true" style={{ display: 'flex' }}><ZapIcon /></span>{isMobile ? 'Decks' : 'Best decks'}
      </Link>
    </li>
  );
};

export default ClanMemberRow;

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '16px 4px',
    borderBottom: '1px solid',
  },
  you: {
    margin: '0 -6px',
    padding: '12px 10px',
    borderRadius: '12px',
    backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
  },
  youTag: {
    borderColor: 'transparent',
  },
  who: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '3px',
    flex: 1,
    minWidth: 0,
  },
  nameLine: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    minWidth: 0,
  },
  name: {
    minWidth: 0,
    fontSize: '15px',
    fontWeight: 600 as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  role: {
    flexShrink: 0,
    padding: '1px 7px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600 as const,
  },
  meta: {
    fontSize: '13px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: '5px',
  },
  badge: {
    flexShrink: 0,
    padding: '3px 9px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700 as const,
  },
  today: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
    gap: '4px',
    flexShrink: 0,
    minWidth: '58px',
  },
  pips: {
    display: 'flex' as const,
    gap: '4px',
  },
  pip: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    border: '1.5px solid',
  },
  todayLabel: {
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  decksLink: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '5px',
    flexShrink: 0,
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
};
