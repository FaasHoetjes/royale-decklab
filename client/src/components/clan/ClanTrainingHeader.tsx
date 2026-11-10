import type { ClanWar } from '../../api';
import { useNow } from '../../hooks/useNow';
import { countdownText, dayLabel } from '../../lib/clanWar';
import { BannerTop, RaceLanes, RiverWater, water } from './RiverBanner';
import LastWeekPodium from './LastWeekPodium';

interface ClanTrainingHeaderProps {
  war: ClanWar;
  isMobile: boolean;
}

/** The training-day header: every boat waits at the start line while the clock runs down to the war. */
const ClanTrainingHeader = ({ war, isMobile }: ClanTrainingHeaderProps) => (
  <RiverWater isMobile={isMobile}>
    <BannerTop war={war} eyebrow={dayLabel(war)} isMobile={isMobile} />
    <div style={styles.stage}>
      {war.race.length > 0 && <RaceLanes war={war} atStartLine showFinish={false} />}
      <div style={styles.countdown}>
        {war.warStartsAt ? <WarCountdown target={war.warStartsAt} isMobile={isMobile} /> : <span style={styles.lead}>War starts Thursday</span>}
      </div>
    </div>
    <LastWeekPodium war={war} isMobile={isMobile} />
  </RiverWater>
);

export default ClanTrainingHeader;

const WarCountdown = ({ target, isMobile }: { target: string; isMobile: boolean }) => {
  const now = useNow(1000);
  return (
    <>
      <span style={styles.lead}>War starts in</span>
      <span style={{ ...styles.clock, fontSize: isMobile ? '30px' : '38px' }}>~{countdownText(Date.parse(target) - now)}</span>
    </>
  );
};

const styles = {
  stage: {
    position: 'relative' as const,
    minHeight: '120px',
  },
  countdown: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingLeft: '48px',
    textAlign: 'center' as const,
  },
  lead: {
    fontSize: '15px',
    fontWeight: 600 as const,
    color: water.text,
  },
  clock: {
    fontWeight: 700 as const,
    lineHeight: 1.1,
    color: water.gold,
    fontVariantNumeric: 'tabular-nums' as const,
    textShadow: 'var(--water-shadow)',
  },
};
