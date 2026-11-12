import type { ClanWar } from '../../api';
import { DECKS_PER_WEEK, lastWeek, lastWeekPodium, ordinal, type PodiumPlace } from '../../lib/clanWar';
import SlotNumber from '../SlotNumber';
import MedalIcon from './MedalIcon';
import { water } from './RiverBanner';

const MEDAL_COLORS = ['#fbbf24', '#d4d4d8', '#d97706'];

/** The strip along the bottom of the training-day river: last week's result and its three biggest medal earners. */
const LastWeekPodium = ({ war, isMobile }: { war: ClanWar; isMobile: boolean }) => {
  const week = lastWeek(war);
  const podium = lastWeekPodium(war);
  if (!week) return null;

  return (
    <section aria-label="Last week" style={styles.strip}>
      <div style={styles.head}>
        Last week · <b style={styles.strong}>{ordinal(week.rank)}</b> place · <MedalIcon />
        <b style={styles.strong}>{week.medals.toLocaleString('en-US')}</b>
      </div>
      {podium.length > 0 && (
        <ol style={{ ...styles.chips, gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))' }}>
          {podium.map((entry, i) => <Chip key={entry.member.tag} entry={entry} place={i + 1} isMobile={isMobile} />)}
        </ol>
      )}
    </section>
  );
};

export default LastWeekPodium;

const Chip = ({ entry, place, isMobile }: { entry: PodiumPlace; place: number; isMobile: boolean }) => {
  const decks = entry.member.decksUsedPastWeeks[0] ?? 0;
  return (
    <li
      aria-label={`${ordinal(place)}: ${entry.member.name}, ${entry.fame.toLocaleString('en-US')} medals, ${decks} of ${DECKS_PER_WEEK} decks`}
      style={{
        ...styles.chip,
        ...(isMobile ? styles.chipRow : styles.chipStacked),
        ...(place === 1 ? styles.first : {}),
      }}
    >
      <span aria-hidden="true" style={{ ...styles.medal, backgroundColor: MEDAL_COLORS[place - 1], ...(isMobile ? styles.medalSmall : styles.medalTall) }}>
        {place}
      </span>
      <b style={styles.name}>{entry.member.name}</b>
      <span aria-hidden="true" style={{ ...styles.meta, ...(isMobile ? styles.metaRow : {}) }}>
        <MedalIcon />
        <b style={styles.fame}>
          <SlotNumber value={entry.fame} />
        </b>
        <span>· {decks}/{DECKS_PER_WEEK} decks</span>
      </span>
    </li>
  );
};

const styles = {
  strip: {
    marginTop: '10px',
    paddingTop: '12px',
    borderTop: '1px solid var(--water-chip-border)',
  },
  head: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: '0 5px',
    fontSize: '12.5px',
    color: water.muted,
  },
  strong: {
    color: water.text,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  chips: {
    display: 'grid' as const,
    gap: '8px',
    margin: '10px 0 0',
    padding: 0,
    listStyle: 'none',
  },
  chip: {
    display: 'grid' as const,
    alignItems: 'center' as const,
    gap: '2px 10px',
    minWidth: 0,
    borderRadius: '12px',
    backgroundColor: 'var(--water-chip-bg)',
    border: '1px solid',
    borderColor: 'var(--water-chip-border)',
  },
  chipStacked: {
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    padding: '9px 11px',
  },
  chipRow: {
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    padding: '7px 10px',
  },
  first: {
    borderColor: 'color-mix(in srgb, #fbbf24 55%, transparent)',
    boxShadow: '0 0 18px rgba(251, 191, 36, 0.18)',
  },
  medal: {
    display: 'grid' as const,
    placeItems: 'center' as const,
    borderRadius: '50%',
    fontWeight: 800 as const,
    color: '#1a1407',
  },
  medalTall: {
    gridRow: 'span 2',
    width: '28px',
    height: '28px',
    fontSize: '13px',
  },
  medalSmall: {
    width: '24px',
    height: '24px',
    fontSize: '12px',
  },
  name: {
    minWidth: 0,
    fontSize: '13.5px',
    color: water.text,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  meta: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    minWidth: 0,
    fontSize: '12px',
    color: water.muted,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  metaRow: {
    justifyContent: 'flex-end' as const,
  },
  fame: {
    color: water.gold,
  },
};
