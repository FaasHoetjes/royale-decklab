import type { ClanWar } from '../../api';
import { FINISH_FAME, dayLabel, ordinal, raceStanding } from '../../lib/clanWar';
import SlotNumber from '../SlotNumber';
import { BannerStat, BannerTop, CountdownChip, RaceLanes, RiverWater } from './RiverBanner';

interface ClanRiverHeaderProps {
  war: ClanWar;
  updatedAt: number;
  isMobile: boolean;
}

const LAST_DAY = 4;

/** The battle-day header: the whole river race, this clan's boat in gold, and how long today has left. */
const ClanRiverHeader = ({ war, updatedAt, isMobile }: ClanRiverHeaderProps) => {
  const standing = raceStanding(war);
  const isColosseum = war.period === 'colosseum';
  const fameToGo = standing && !isColosseum ? FINISH_FAME - standing.ours.fame : 0;

  return (
    <RiverWater isMobile={isMobile}>
      <BannerTop
        war={war}
        eyebrow={`${dayLabel(war)} · River race`}
        updatedAt={updatedAt}
        isMobile={isMobile}
        aside={
          war.dayEndsAt && <CountdownChip lead={war.day === LAST_DAY ? 'War ends in' : 'Day ends in'} target={war.dayEndsAt} />
        }
      />
      {war.race.length > 0 && <RaceLanes war={war} showFinish={!isColosseum} />}
      <div style={styles.stats}>
        {standing && <BannerStat value={ordinal(standing.position)} label="in the race" />}
        {standing && (
          <BannerStat
            value={ordinal(standing.todayRank)}
            label="today"
            color={standing.todayRank <= 2 ? 'var(--up)' : 'var(--down)'}
          />
        )}
        {fameToGo > 0 && <BannerStat value={<SlotNumber value={fameToGo} />} label="fame to the finish" />}
        {standing && !isColosseum && fameToGo <= 0 && <BannerStat value="✓" label="crossed the finish" />}
        <BannerStat value={<SlotNumber value={war.decksLeftToday} />} label={war.decksLeftToday === 1 ? 'deck left today' : 'decks left today'} />
      </div>
    </RiverWater>
  );
};

export default ClanRiverHeader;

const styles = {
  stats: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '4px 18px',
  },
};
