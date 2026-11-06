import type { ClanWarMember } from '../../api';
import { getTheme } from '../../theme';
import { groupByToday, todayStatusLabel, type TodayStatus } from '../../lib/clanWar';
import SlotNumber from '../SlotNumber';

interface ClanTodayBarProps {
  members: ClanWarMember[];
  filter: TodayStatus | null;
  onFilter: (status: TodayStatus | null) => void;
}

export const todayStatusColor: Record<TodayStatus, string> = {
  notStarted: 'var(--text-tertiary)',
  started: 'var(--accent)',
  done: 'var(--up)',
};

const BAR_ORDER: TodayStatus[] = ['done', 'started', 'notStarted'];

/** Done, Started and Not started as one bar; picking a part shows just those members below. */
const ClanTodayBar = ({ members, filter, onFilter }: ClanTodayBarProps) => {
  const theme = getTheme();
  const groups = groupByToday(members);
  const pick = (status: TodayStatus) => onFilter(filter === status ? null : status);

  return (
    <div style={styles.wrap}>
      <div style={styles.bar} aria-hidden="true">
        {BAR_ORDER.filter((status) => groups[status].length > 0).map((status, i) => (
          <span
            key={status}
            className="clan-bar-segment"
            onClick={() => pick(status)}
            style={{
              ...styles.segment,
              flexGrow: groups[status].length,
              backgroundColor: todayStatusColor[status],
              opacity: filter && filter !== status ? 0.3 : 1,
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </div>
      <div style={styles.legend} role="group" aria-label="Show members by today's progress">
        {BAR_ORDER.map((status) => {
          const active = filter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => pick(status)}
              className="mobile-touch-target"
              style={{
                ...styles.chip,
                borderColor: active ? todayStatusColor[status] : 'transparent',
                backgroundColor: active ? theme.bg.tertiary : 'transparent',
                color: theme.text.primary,
              }}
            >
              <span style={{ ...styles.swatch, backgroundColor: todayStatusColor[status] }} />
              <span style={styles.count}>
                <SlotNumber value={groups[status].length} />
              </span>
              <span style={{ ...styles.label, color: theme.text.secondary }}>{todayStatusLabel[status]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ClanTodayBar;

const styles = {
  wrap: {
    marginTop: '18px',
  },
  bar: {
    display: 'flex' as const,
    gap: '3px',
    height: '14px',
    borderRadius: '7px',
    overflow: 'hidden' as const,
  },
  segment: {
    flexBasis: 0,
    minWidth: '6px',
    cursor: 'pointer' as const,
    transition: 'opacity 0.2s ease',
  },
  legend: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '4px 6px',
    marginTop: '10px',
    marginLeft: '-8px',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    padding: '4px 10px 4px 8px',
    border: '1px solid',
    borderRadius: '999px',
    font: 'inherit',
    cursor: 'pointer' as const,
  },
  swatch: {
    width: '9px',
    height: '9px',
    borderRadius: '3px',
  },
  count: {
    fontFamily: "'Lilita One', system-ui, -apple-system, sans-serif",
    fontSize: '19px',
    lineHeight: 1,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600 as const,
  },
};
