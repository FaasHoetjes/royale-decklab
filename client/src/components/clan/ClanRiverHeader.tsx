import { useState } from 'react';
import type { ClanWar } from '../../api';
import { FINISH_FAME, dayLabel, ordinal, raceStanding } from '../../lib/clanWar';
import SlotNumber from '../SlotNumber';
import { BannerStat, BannerTop, CountdownChip, RaceLanes, RiverWater, water } from './RiverBanner';
import ClanDailyStandings from './ClanDailyStandings';

interface ClanRiverHeaderProps {
  war: ClanWar;
  isMobile: boolean;
}

const LAST_DAY = 4;

/** The battle-day header: the whole river race, this clan's boat in gold, and how long today has left. */
const ClanRiverHeader = ({ war, isMobile }: ClanRiverHeaderProps) => {
  const standing = raceStanding(war);
  const [view, setView] = useState<'race' | 'medals'>('race');
  // Remounting the lanes on each return to the race sails the boats out from the start line again.
  const [raceVisits, setRaceVisits] = useState(0);
  const showView = (tab: 'race' | 'medals') => {
    if (tab === 'race' && view !== 'race') setRaceVisits((n) => n + 1);
    setView(tab);
  };
  const isColosseum = war.period === 'colosseum';
  const fameToGo = standing && !isColosseum ? FINISH_FAME - standing.ours.fame : 0;

  return (
    <RiverWater isMobile={isMobile}>
      <BannerTop
        war={war}
        eyebrow={`${dayLabel(war)} · River race`}
        isMobile={isMobile}
        aside={
          war.dayEndsAt && <CountdownChip finalDay={war.day === LAST_DAY} target={war.dayEndsAt} />
        }
      />
      {war.race.length > 0 && <div role="group" aria-label="Clan standings view" style={styles.tabs}>
        {(['race', 'medals'] as const).map((tab) => {
          const active = view === tab;
          return <button
            key={tab}
            type="button"
            aria-pressed={active}
            onClick={() => showView(tab)}
            style={{
              ...styles.tab,
              ...(active ? styles.tabActive : {}),
            }}
          >{tab === 'race' ? 'River race' : 'Today’s medals'}</button>;
        })}
      </div>}
      <div style={{ display: 'grid' }}>
      {war.race.length > 0 && <div aria-hidden={view !== 'medals'} style={{ gridArea: '1 / 1', minWidth: 0, visibility: view === 'medals' ? 'visible' : 'hidden' }}><ClanDailyStandings war={war} /></div>}
      <div aria-hidden={view !== 'race' && war.race.length > 0} style={{ gridArea: '1 / 1', minWidth: 0, visibility: view === 'race' || war.race.length === 0 ? 'visible' : 'hidden' }}>
      {war.race.length > 0 && <RaceLanes key={raceVisits} war={war} showFinish={!isColosseum} />}
      <div style={styles.stats}>
        {standing && <BannerStat value={ordinal(standing.position)} label="in the race" />}
        {standing && (
          <BannerStat
            value={ordinal(standing.todayRank)}
            label="today"
            color={standing.todayRank <= 2 ? 'var(--up)' : 'var(--down)'}
          />
        )}
        {fameToGo > 0 && <BannerStat value={<SlotNumber value={fameToGo} />} label="points to finish" />}
        {standing && !isColosseum && fameToGo <= 0 && <BannerStat value="✓" label="crossed the finish" />}
        <BannerStat value={<SlotNumber value={war.decksLeftToday} />} label={war.decksLeftToday === 1 ? 'deck left today' : 'decks left today'} />
      </div>
      </div>
      </div>
    </RiverWater>
  );
};

export default ClanRiverHeader;

const styles = {
  stats: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '12px 24px',
    paddingTop: '10px',
  },
  tabs: {
    display: 'inline-flex' as const,
    gap: '2px',
    marginTop: '16px',
    padding: '3px',
    borderRadius: '999px',
    background: 'var(--water-chip-bg)',
    border: '1px solid var(--water-chip-border)',
  },
  tab: {
    font: 'inherit',
    fontSize: '12px',
    padding: '5px 12px',
    border: 0,
    borderRadius: '999px',
    background: 'transparent',
    color: water.muted,
    cursor: 'pointer' as const,
  },
  tabActive: {
    fontWeight: 600 as const,
    color: water.text,
    background: 'var(--water-tab-active)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.14)',
  },
};
