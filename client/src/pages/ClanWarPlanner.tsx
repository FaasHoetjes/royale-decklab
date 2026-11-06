import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { ApiError, type ClanWar } from '../api';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useClanWar, usePlayerWarDecks } from '../queries';
import { isValidTag, normalizeTag } from '../lib/playerTag';
import { routeFlag } from '../lib/routeState';
import { rememberClan } from '../lib/recentClans';
import { TODAY_STATUSES, groupByToday, todayStatusLabel, type TodayStatus } from '../lib/clanWar';
import ClanFinder from '../components/clan/ClanFinder';
import ClanRiverHeader from '../components/clan/ClanRiverHeader';
import ClanTrainingHeader from '../components/clan/ClanTrainingHeader';
import ClanMemberRow from '../components/clan/ClanMemberRow';
import ClanMemberGroup from '../components/clan/ClanMemberGroup';
import ClanTodayBar, { todayStatusColor } from '../components/clan/ClanTodayBar';
import ClanReminderButton from '../components/clan/ClanReminderButton';
import LoadError from '../components/LoadError';
import { ClanWarSkeleton } from '../components/LoadingSkeletons';

const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status;

const ClanWarPlanner = () => {
  const { clanTag } = useParams();
  const isMobile = useIsMobile();
  const theme = getTheme();

  const body = clanTag ? <ClanWarView clanTag={normalizeTag(clanTag)} isMobile={isMobile} /> : <OwnClan isMobile={isMobile} />;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ marginBottom: isMobile ? '18px' : '26px' }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ ...styles.title, color: theme.text.primary }}>
          Clan War Planner
        </h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          See who still has war decks to play today, and the best decks for each member.
        </p>
      </div>
      {body}
    </div>
  );
};

export default ClanWarPlanner;

/** Without a tag in the address, the active player's clan opens, unless they came here to pick another one. */
const OwnClan = ({ isMobile }: { isMobile: boolean }) => {
  const { activePlayerTag } = useApp();
  const location = useLocation();
  const wantsOtherClan = routeFlag(location.state, 'pickClan');
  const player = usePlayerWarDecks(activePlayerTag);

  if (wantsOtherClan || !activePlayerTag) return <ClanFinder />;
  if (player.isLoading) return <ClanWarSkeleton isMobile={isMobile} />;

  const ownClanTag = player.data?.player.clanTag;
  if (ownClanTag) return <Navigate to={`/clan/${normalizeTag(ownClanTag)}`} replace />;
  if (player.data) return <ClanFinder notice={`${player.data.player.name} isn't in a clan.`} />;
  return <ClanFinder />;
};

const ClanWarView = ({ clanTag, isMobile }: { clanTag: string; isMobile: boolean }) => {
  const theme = getTheme();
  const { activePlayerTag } = useApp();
  const isTagValid = isValidTag(clanTag);
  const war = useClanWar(isTagValid ? `#${clanTag}` : null);
  const [filter, setFilter] = useState<TodayStatus | null>(null);
  const loaded = war.data;

  useEffect(() => {
    if (loaded) rememberClan({ tag: loaded.tag, name: loaded.name, badgeId: loaded.badgeId });
  }, [loaded?.tag, loaded?.name, loaded?.badgeId]);

  if (!isTagValid || isStatus(war.error, 400)) return <ClanFinder notice={`#${clanTag} isn't a valid clan tag.`} />;
  if (isStatus(war.error, 404)) return <ClanFinder notice={`There's no clan with the tag #${clanTag}.`} />;
  if (war.isLoading) return <ClanWarSkeleton isMobile={isMobile} />;
  if (!war.data) {
    return (
      <LoadError
        title="Couldn't load this clan's war"
        message="Something went wrong on our end. Please try again in a moment."
        onRetry={() => war.refetch()}
        retrying={war.isFetching}
      />
    );
  }

  const youTag = activePlayerTag ? `#${normalizeTag(activePlayerTag)}` : null;
  const hasToday = war.data.isBattleDay && war.data.members.length > 0;

  return (
    <>
      {war.data.isBattleDay ? (
        <ClanRiverHeader war={war.data} updatedAt={war.dataUpdatedAt} isMobile={isMobile} />
      ) : (
        <ClanTrainingHeader war={war.data} updatedAt={war.dataUpdatedAt} isMobile={isMobile} />
      )}
      {hasToday && (
        <section
          aria-label="Today"
          style={{ ...styles.today, padding: isMobile ? '14px 16px 16px' : '16px 24px 20px', borderColor: theme.border, backgroundColor: theme.bg.secondary }}
        >
          <ClanTodayBar members={war.data.members} filter={filter} onFilter={setFilter} />
          {war.data.decksLeftToday > 0 && (
            <div style={styles.todayActions}>
              <ClanReminderButton war={war.data} />
            </div>
          )}
        </section>
      )}
      <MemberList war={war.data} filter={filter} youTag={youTag} isMobile={isMobile} />
    </>
  );
};

interface MemberListProps {
  war: ClanWar;
  filter: TodayStatus | null;
  youTag: string | null;
  isMobile: boolean;
}

/** On war days the members to chase come first, in groups by how far they got today; Done starts folded. */
const MemberList = ({ war, filter, youTag, isMobile }: MemberListProps) => {
  const theme = getTheme();
  if (war.members.length === 0) {
    return <p style={{ ...styles.empty, color: theme.text.secondary }}>This clan has no members.</p>;
  }

  if (war.isBattleDay) {
    const groups = groupByToday(war.members);
    const shown = (filter ? [filter] : TODAY_STATUSES).filter((status) => groups[status].length > 0);
    return (
      <>
        {shown.map((status) => (
          <ClanMemberGroup
            key={filter ? `${status}-picked` : status}
            id={status}
            title={todayStatusLabel[status]}
            color={todayStatusColor[status]}
            members={groups[status]}
            war={war}
            youTag={youTag}
            startsOpen={filter != null || status !== 'done'}
            isMobile={isMobile}
          />
        ))}
      </>
    );
  }

  const heading: ReactNode = war.pastWeeks.length > 0 ? 'Last week, fewest decks first' : 'Members';
  return (
    <>
      <h3 style={{ ...styles.listTitle, color: theme.text.secondary }}>{heading}</h3>
      <ul style={styles.list}>
        {war.members.map((member) => (
          <ClanMemberRow key={member.tag} member={member} war={war} isMobile={isMobile} isYou={member.tag === youTag} />
        ))}
      </ul>
    </>
  );
};

const styles = {
  container: {
    maxWidth: '760px',
    margin: '0 auto',
  },
  title: {
    margin: 0,
    fontSize: '1.5em',
  },
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
  },
  today: {
    border: '1px solid',
    borderRadius: '14px',
    margin: '-8px 0 22px',
  },
  todayActions: {
    marginTop: '14px',
  },
  listTitle: {
    margin: '0 0 4px',
    fontSize: '14px',
    fontWeight: 700 as const,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  empty: {
    fontSize: '15px',
  },
};
