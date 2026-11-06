import type { ClanWar } from '../../api';
import { lastWeek } from '../../lib/clanWar';
import { BannerTop, RiverWater, water } from './RiverBanner';

interface ClanNotRacingHeaderProps {
  war: ClanWar;
  updatedAt: number;
  isMobile: boolean;
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

/** For a clan that sits this week out: still water, and when it last raced if it ever did. */
const ClanNotRacingHeader = ({ war, updatedAt, isMobile }: ClanNotRacingHeaderProps) => {
  const last = lastWeek(war);
  const lastRaced = last?.endedAt ? monthYear.format(new Date(last.endedAt)) : null;
  return (
    <RiverWater isMobile={isMobile}>
      <BannerTop war={war} eyebrow="Not in a river race" updatedAt={updatedAt} isMobile={isMobile} />
      <div style={styles.note}>
        <span style={styles.lead}>This clan isn't in a river race this week</span>
        <span style={styles.sub}>{lastRaced ? `Its last race ended in ${lastRaced}` : 'It has no past races yet'}</span>
      </div>
    </RiverWater>
  );
};

export default ClanNotRacingHeader;

const styles = {
  note: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '4px',
    padding: '28px 0 20px',
    textAlign: 'center' as const,
  },
  lead: {
    fontSize: '15px',
    fontWeight: 600 as const,
    color: water.text,
  },
  sub: {
    fontSize: '13px',
    color: water.muted,
  },
};
