import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { ApiError, type ClanWar } from '../api';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useClanWar, usePlayerSummary } from '../queries';
import { isValidTag, normalizeTag } from '../lib/playerTag';
import { routeFlag } from '../lib/routeState';
import { loadRecentClans, rememberClan } from '../lib/recentClans';
import { TODAY_STATUSES, groupByToday, todayStatusLabel, type TodayStatus } from '../lib/clanWar';
import ClanFinder from '../components/clan/ClanFinder';
import ClanRiverHeader from '../components/clan/ClanRiverHeader';
import ClanTrainingHeader from '../components/clan/ClanTrainingHeader';
import ClanNotRacingHeader from '../components/clan/ClanNotRacingHeader';
import ClanMemberRow from '../components/clan/ClanMemberRow';
import ClanMemberGroup from '../components/clan/ClanMemberGroup';
import ClanTodayBar, { todayStatusColor } from '../components/clan/ClanTodayBar';
import ClanReminderButton from '../components/clan/ClanReminderButton';
import ClanDiscordRow from '../components/clan/ClanDiscordRow';
import LoadError from '../components/LoadError';
import { ClanWarSkeleton } from '../components/LoadingSkeletons';

const isStatus = (error: unknown, status: number) => error instanceof ApiError && error.status === status;

const ClanWarPlanner = () => {
  const { clanTag } = useParams();
  const isMobile = useIsMobile();
  const theme = getTheme();
  const normalizedClanTag = clanTag ? normalizeTag(clanTag) : null;
  const war = useClanWar(normalizedClanTag && isValidTag(normalizedClanTag) ? `#${normalizedClanTag}` : null);
  const [refreshAnimating, setRefreshAnimating] = useState(false);
  const refreshing = war.isFetching || refreshAnimating;

  useEffect(() => {
    if (!refreshAnimating || war.isFetching) return;
    const timer = window.setTimeout(() => setRefreshAnimating(false), 650);
    return () => window.clearTimeout(timer);
  }, [refreshAnimating, war.isFetching]);

  const body = normalizedClanTag ? <ClanWarView clanTag={normalizedClanTag} isMobile={isMobile} war={war} /> : <OwnClan isMobile={isMobile} />;

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ marginBottom: isMobile ? '18px' : '26px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
        <div style={{ minWidth: 0 }}>
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ ...styles.title, color: theme.text.primary }}>
          Clan War Planner
        </h1>
        <p style={{ ...styles.subtitle, margin: isMobile ? 0 : undefined, color: theme.text.secondary }}>
          See who still has war decks to play today, and the best decks for each member.
        </p>
        </div>
        {war.data?.isBattleDay && <button type="button" onClick={() => { setRefreshAnimating(true); void war.refetch(); }} disabled={refreshing} aria-busy={refreshing} title="Fetch the latest available data. Clan results are cached for up to 60 seconds." aria-label="Refresh clan war data" style={{ font: 'inherit', fontSize: '12px', padding: '5px 0 5px 10px', border: 0, background: 'none', color: theme.text.secondary, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <svg className={refreshing ? 'clan-refreshing' : undefined} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M20 12a8 8 0 1 0-2.3 5.7M20 7v5" /></svg>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>}
      </div>
      {body}
    </div>
  );
};

export default ClanWarPlanner;

/** Without a tag in the address, the last clan viewed reopens, else the active player's own, unless they came to pick another. */
const OwnClan = ({ isMobile }: { isMobile: boolean }) => {
  const { activePlayerTag } = useApp();
  const location = useLocation();
  const wantsOtherClan = routeFlag(location.state, 'pickClan');
  const [lastClan] = useState(() => loadRecentClans()[0] ?? null);
  const player = usePlayerSummary(wantsOtherClan || lastClan ? null : activePlayerTag);

  if (wantsOtherClan) return <ClanFinder />;
  if (lastClan) return <Navigate to={`/clan/${normalizeTag(lastClan.tag)}`} replace />;
  if (!activePlayerTag) return <ClanFinder />;
  if (player.isLoading) return <ClanWarSkeleton isMobile={isMobile} />;

  const ownClanTag = player.data?.clanTag;
  if (ownClanTag) return <Navigate to={`/clan/${normalizeTag(ownClanTag)}`} replace />;
  if (player.data) return <ClanFinder notice={`${player.data.name} isn't in a clan.`} />;
  return <ClanFinder />;
};

const ClanWarView = ({ clanTag, isMobile, war }: { clanTag: string; isMobile: boolean; war: ReturnType<typeof useClanWar> }) => {
  const theme = getTheme();
  const { activePlayerTag } = useApp();
  const isTagValid = isValidTag(clanTag);
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
      {war.isRefetchError && <p role="status" style={{ fontSize: '12px', color: theme.text.secondary, marginBottom: '10px' }}>Couldn’t refresh. Showing the last loaded results.</p>}
      {war.data.isBattleDay ? (
        <ClanRiverHeader key={war.data.tag} war={war.data} isMobile={isMobile} />
      ) : war.data.period === 'notRacing' ? (
        <ClanNotRacingHeader war={war.data} isMobile={isMobile} />
      ) : (
        <ClanTrainingHeader war={war.data} isMobile={isMobile} />
      )}
      <ClanDiscordRow war={war.data} />
      {hasToday && (
        <section
          aria-label="Today"
          style={{ ...styles.today, padding: isMobile ? '12px 16px 10px' : '14px 20px 12px', borderColor: theme.border, backgroundColor: theme.bg.secondary }}
        >
          <ClanTodayBar
            members={war.data.members}
            filter={filter}
            onFilter={setFilter}
            action={war.data.decksLeftToday > 0 && <ClanReminderButton war={war.data} />}
          />
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
  const members = [...war.members].sort((a, b) =>
    war.isBattleDay ? b.fame - a.fame : (b.famePastWeeks[0] ?? 0) - (a.famePastWeeks[0] ?? 0)
  );

  if (war.isBattleDay) {
    const groups = groupByToday(members);
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

  const lastRace = war.period === 'notRacing' ? "last race's" : "last week's";
  const heading: ReactNode = war.pastWeeks.length > 0 ? `Clanmates, by ${lastRace} medals` : 'Members';
  return (
    <>
      <h3 style={{ ...styles.listTitle, color: theme.text.secondary }}>{heading}</h3>
      <ul style={styles.list}>
        {members.map((member) => (
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
