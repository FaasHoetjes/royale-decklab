import type { ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useApp } from '../AppContext';
import { ApiError, type ClanWar } from '../api';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useClanWar, usePlayerWarDecks } from '../queries';
import { isValidTag, normalizeTag } from '../lib/playerTag';
import { routeFlag } from '../lib/routeState';
import ClanSearch from '../components/clan/ClanSearch';
import ClanWarSummary from '../components/clan/ClanWarSummary';
import ClanMemberRow from '../components/clan/ClanMemberRow';
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
      <div
        style={{
          ...styles.header,
          borderBottomColor: theme.border,
          marginBottom: isMobile ? '18px' : '24px',
          paddingBottom: isMobile ? '14px' : '18px',
        }}
      >
        <h1 className={isMobile ? 'visually-hidden' : undefined} style={{ ...styles.title, color: theme.text.primary }}>
          Clan War Planner
        </h1>
        <p style={{ ...styles.subtitle, marginTop: isMobile ? 0 : '6px', color: theme.text.secondary }}>
          Who in your clan still has war decks to play today, and how everyone did in the last weeks.
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
  const player = usePlayerWarDecks(wantsOtherClan ? null : activePlayerTag);

  if (wantsOtherClan || !activePlayerTag) return <ClanSearch />;
  if (player.isLoading) return <ClanWarSkeleton isMobile={isMobile} />;

  const ownClanTag = player.data?.player.clanTag;
  if (ownClanTag) return <Navigate to={`/clan/${normalizeTag(ownClanTag)}`} replace />;
  if (player.data) return <ClanSearch notice={`${player.data.player.name} isn't in a clan.`} />;
  return <ClanSearch />;
};

const ClanWarView = ({ clanTag, isMobile }: { clanTag: string; isMobile: boolean }) => {
  const isTagValid = isValidTag(clanTag);
  const war = useClanWar(isTagValid ? `#${clanTag}` : null);

  if (!isTagValid || isStatus(war.error, 400)) return <ClanSearch notice={`#${clanTag} isn't a valid clan tag.`} />;
  if (isStatus(war.error, 404)) return <ClanSearch notice={`There's no clan with the tag #${clanTag}.`} />;
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

  return (
    <>
      <ClanWarSummary war={war.data} isMobile={isMobile} />
      <MemberList war={war.data} isMobile={isMobile} />
    </>
  );
};

const MemberList = ({ war, isMobile }: { war: ClanWar; isMobile: boolean }) => {
  const theme = getTheme();
  if (war.members.length === 0) {
    return <p style={{ ...styles.empty, color: theme.text.secondary }}>This clan has no members.</p>;
  }

  let heading: ReactNode = 'Members';
  if (war.isBattleDay) heading = 'Decks left today';
  else if (war.pastWeeks.length > 0) heading = 'Last week, fewest decks first';

  return (
    <>
      <h3 style={{ ...styles.listTitle, color: theme.text.secondary }}>{heading}</h3>
      <ul style={styles.list}>
        {war.members.map((member) => (
          <ClanMemberRow key={member.tag} member={member} war={war} isMobile={isMobile} />
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
  header: {
    borderBottom: '1px solid',
  },
  title: {
    margin: 0,
    fontSize: '1.5em',
  },
  subtitle: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: 0,
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
