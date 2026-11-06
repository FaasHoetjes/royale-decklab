import { Link } from 'react-router-dom';
import type { ClanWar } from '../../api';
import { getTheme } from '../../theme';
import { dayLabel, lastWeek, lastWeekTurnout } from '../../lib/clanWar';

interface ClanWarSummaryProps {
  war: ClanWar;
  isMobile: boolean;
}

interface Stat {
  key: string;
  value: string;
  label: string;
}

const formatFame = (fame: number) => fame.toLocaleString('en-US');

const battleDayStats = (war: ClanWar): Stat[] => [
  { key: 'left', value: String(war.decksLeftToday), label: war.decksLeftToday === 1 ? 'deck left today' : 'decks left today' },
  { key: 'done', value: `${war.membersDoneToday}/${war.members.length}`, label: 'members done' },
];

const lastWeekStats = (war: ClanWar): Stat[] => {
  const week = lastWeek(war);
  const turnout = lastWeekTurnout(war);
  if (!week || !turnout) return [];
  return [
    { key: 'rank', value: `#${week.rank}`, label: 'last week' },
    { key: 'fame', value: formatFame(week.fame), label: 'fame' },
    { key: 'all', value: String(turnout.playedAll), label: 'played all 16' },
    { key: 'missed', value: String(turnout.missedSome), label: 'missed decks' },
  ];
};

const ClanWarSummary = ({ war, isMobile }: ClanWarSummaryProps) => {
  const theme = getTheme();
  const stats = war.isBattleDay ? battleDayStats(war) : lastWeekStats(war);
  const hasLeavers = war.isBattleDay && war.leaversWithDecks > 0;

  return (
    <section
      style={{
        ...styles.panel,
        padding: isMobile ? '16px' : '20px 24px',
        borderColor: theme.border,
        backgroundColor: theme.bg.secondary,
      }}
    >
      <div style={styles.top}>
        <span style={{ ...styles.eyebrow, color: theme.text.secondary }}>
          {dayLabel(war)}
          {!war.isBattleDay && ' · War starts Thursday'}
        </span>
        <Link to="/clan" state={{ pickClan: true }} style={{ ...styles.change, color: theme.accent }}>
          Other clan
        </Link>
      </div>
      <h2 style={{ ...styles.name, fontSize: isMobile ? '22px' : '26px', color: theme.text.primary }}>{war.name}</h2>
      <span style={{ ...styles.tag, color: theme.text.secondary }}>{war.tag}</span>

      {stats.length > 0 && (
        <div style={{ ...styles.stats, gap: isMobile ? '14px 22px' : '28px' }}>
          {stats.map((stat) => (
            <div key={stat.key} style={styles.stat}>
              <span style={{ ...styles.statValue, color: theme.text.primary }}>{stat.value}</span>
              <span style={{ ...styles.statLabel, color: theme.text.secondary }}>{stat.label}</span>
            </div>
          ))}
        </div>
      )}

      {hasLeavers && (
        <p style={{ ...styles.note, color: theme.text.secondary }}>
          {war.leaversWithDecks === 1 ? '1 player' : `${war.leaversWithDecks} players`} left this week.
        </p>
      )}
    </section>
  );
};

export default ClanWarSummary;

const styles = {
  panel: {
    border: '1px solid',
    borderRadius: '14px',
    marginBottom: '20px',
  },
  top: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '12px',
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: 700 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
  },
  change: {
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  name: {
    margin: '6px 0 0',
    lineHeight: 1.2,
  },
  tag: {
    fontSize: '13px',
    fontFamily: 'monospace',
  },
  stats: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    marginTop: '16px',
  },
  stat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  statValue: {
    fontSize: '22px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  statLabel: {
    fontSize: '12px',
  },
  note: {
    fontSize: '13px',
    margin: '14px 0 0',
  },
};
