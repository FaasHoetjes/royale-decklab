import type { ClanWar } from '../../api';
import { getTheme } from '../../theme';
import { DECKS_PER_WEEK, lastWeek, lastWeekPodium, lastWeekTurnout, ordinal, type PodiumPlace } from '../../lib/clanWar';
import { Avatar } from '../PlayerMenu';
import SlotNumber from '../SlotNumber';

const STEPS = [
  { place: 2, height: 62, color: '#d4d4d8' },
  { place: 1, height: 86, color: '#fbbf24' },
  { place: 3, height: 48, color: '#d97706' },
];

const formatMedals = (medals: number) => medals.toLocaleString('en-US');

/** Last week's result with its three biggest medal earners on a podium: second, first, third. */
const LastWeekPodium = ({ war, isMobile }: { war: ClanWar; isMobile: boolean }) => {
  const theme = getTheme();
  const week = lastWeek(war);
  const turnout = lastWeekTurnout(war);
  const podium = lastWeekPodium(war);
  if (!week) return null;

  const byPlace = new Map(podium.map((entry, i) => [i + 1, entry]));

  return (
    <section
      aria-label="Last week"
      style={{ ...styles.panel, padding: isMobile ? '16px' : '18px 24px', borderColor: theme.border, backgroundColor: theme.bg.secondary }}
    >
      <div style={{ ...styles.eyebrow, color: theme.text.secondary }}>
        Last week · {ordinal(week.rank)} place · {formatMedals(week.medals)} medals
      </div>
      {podium.length > 0 && (
        <ol style={styles.podium}>
          {STEPS.map((step, i) => {
            const entry = byPlace.get(step.place);
            return entry ? <Step key={step.place} entry={entry} step={step} delay={i * 120} /> : <li key={step.place} />;
          })}
        </ol>
      )}
      {turnout && (
        <p style={{ ...styles.turnout, color: theme.text.secondary }}>
          {turnout.playedAll} played all {DECKS_PER_WEEK} · {turnout.missedSome} missed decks
        </p>
      )}
    </section>
  );
};

export default LastWeekPodium;

interface StepProps {
  entry: PodiumPlace;
  step: (typeof STEPS)[number];
  delay: number;
}

const Step = ({ entry, step, delay }: StepProps) => {
  const theme = getTheme();
  return (
    <li style={styles.place} aria-label={`${ordinal(step.place)}: ${entry.member.name}, ${formatMedals(entry.fame)} medals`}>
      <Avatar name={entry.member.name} size={34} />
      <b style={{ ...styles.placeName, color: theme.text.primary }}>{entry.member.name}</b>
      <span style={{ ...styles.placeFame, color: theme.text.secondary }}>
        <SlotNumber value={entry.fame} />
      </span>
      <div
        className="clan-podium-step"
        style={{
          ...styles.step,
          height: `${step.height}px`,
          animationDelay: `${delay}ms`,
          background: `linear-gradient(${step.color}, color-mix(in srgb, ${step.color} 30%, transparent))`,
        }}
      >
        <span style={styles.stepNumber}>{step.place}</span>
      </div>
    </li>
  );
};

const styles = {
  panel: {
    border: '1px solid',
    borderRadius: '14px',
    marginBottom: '22px',
    backgroundImage: 'radial-gradient(circle at 50% 0, rgba(251, 191, 36, 0.12), transparent 60%)',
  },
  eyebrow: {
    textAlign: 'center' as const,
    fontSize: '13px',
    fontWeight: 500 as const,
  },
  podium: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    alignItems: 'end' as const,
    gap: '8px',
    maxWidth: '420px',
    margin: '16px auto 0',
    padding: 0,
    listStyle: 'none',
  },
  place: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '5px',
    minWidth: 0,
  },
  placeName: {
    maxWidth: '100%',
    fontSize: '13px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  placeFame: {
    fontSize: '13px',
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  step: {
    width: '100%',
    borderRadius: '10px 10px 0 0',
    display: 'grid' as const,
    placeItems: 'center' as const,
  },
  stepNumber: {
    fontSize: '22px',
    fontWeight: 700 as const,
    color: '#1a1407',
  },
  turnout: {
    margin: '12px 0 0',
    textAlign: 'center' as const,
    fontSize: '13px',
  },
};
