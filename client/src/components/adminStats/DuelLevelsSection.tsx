import { useQuery } from '@tanstack/react-query';
import { fetchDuelLevels, type DuelCushionFit, type DuelLevelEstimate, type DuelLevelFit } from '../../api';
import { LEAGUES } from '../../lib/crownSeries';
import { getTheme } from '../../theme';
import { number } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

const STALE_MS = 10 * 60_000;

const ALL_CAPS = 0;

type Row<T extends string> = { key: string; label: string } & Record<T, string>;

type Column<T extends string> = { label: string; hint: string; field: T };

type LevelField = 'duels' | 'perLevel' | 'weakestCard' | 'evo' | 'hero';

type CushionField = 'decks' | 'rounds' | 'spread' | 'cushion';

const LEVEL_COLUMNS: Column<LevelField>[] = [
  { label: 'Duels', hint: HINTS.duelDuels, field: 'duels' },
  { label: 'Per level', hint: HINTS.perLevel, field: 'perLevel' },
  { label: 'Weakest card', hint: HINTS.weakestCard, field: 'weakestCard' },
  { label: 'Evo', hint: HINTS.evo, field: 'evo' },
  { label: 'Hero', hint: HINTS.hero, field: 'hero' },
];

const CUSHION_COLUMNS: Column<CushionField>[] = [
  { label: 'Decks', hint: HINTS.cushionDecks, field: 'decks' },
  { label: 'Rounds', hint: HINTS.cushionRounds, field: 'rounds' },
  { label: 'Spread', hint: HINTS.spread, field: 'spread' },
  { label: 'Cushion', hint: HINTS.cushion, field: 'cushion' },
];

const estimate = (e: DuelLevelEstimate) => `${e.value.toFixed(2)} ± ${e.standardError.toFixed(2)}`;

const capLabel = (cap: number) =>
  cap === ALL_CAPS
    ? 'All caps'
    : `${cap} · ${LEAGUES.filter((l) => l.levelCap === cap).map((l) => l.name).join(', ')}`;

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const levelRow = (key: string, label: string, fit: DuelLevelFit): Row<LevelField> => ({
  key,
  label,
  duels: number(fit.duels),
  perLevel: estimate(fit.perLevel),
  weakestCard: estimate(fit.weakestCard),
  evo: estimate(fit.evo),
  hero: estimate(fit.hero),
});

const cushionRow = (key: string, label: string, fit: DuelCushionFit): Row<CushionField> => ({
  key,
  label,
  decks: number(fit.decks),
  rounds: number(fit.rounds),
  spread: `${(fit.spread * 100).toFixed(1)} points`,
  cushion: `${Math.round(fit.priorRounds)} rounds`,
});

function applyingNote({ levels, cushion }: { levels: boolean; cushion: boolean }) {
  const followed = [levels && 'level values', cushion && 'cushion'].filter(Boolean).join(' and ');
  if (!followed) return 'Scoring keeps the values in use; the refits are only recorded.';
  return `Scoring follows each refit's all-caps ${followed}: the first refit applied replaces the starting values, later ones move each value at most a set step, and a refit far outside the limits is skipped. Switching this off keeps the values in use rather than going back to the starting ones.`;
}

export function DuelLevelsSection({ token }: { token: string }) {
  const theme = getTheme();
  const levels = useQuery({
    queryKey: ['admin-duel-levels', token],
    queryFn: ({ signal }) => fetchDuelLevels(token, signal),
    retry: false,
    staleTime: STALE_MS,
  });
  if (!levels.data) return null;

  const { inUse, applying, refits } = levels.data;
  const latest = refits[0];
  const latestLevels = refits.find((r) => r.fits.length > 0);
  const latestCushions = refits.find((r) => r.cushions.length > 0);
  const currentLevels: Row<LevelField>[] = [
    {
      key: 'in-use',
      label: 'In use',
      duels: '–',
      perLevel: inUse.perLevel.toFixed(2),
      weakestCard: inUse.weakestCard.toFixed(2),
      evo: inUse.evo.toFixed(2),
      hero: inUse.hero.toFixed(2),
    },
    ...(latestLevels?.fits.map((f) => levelRow(`cap-${f.cap}`, capLabel(f.cap), f)) ?? []),
  ];
  const weeklyLevels = refits.flatMap((r) => {
    const all = r.fits.find((f) => f.cap === ALL_CAPS);
    return all ? [levelRow(String(r.fittedAtMs), day(r.fittedAtMs), all)] : [];
  });
  const currentCushions: Row<CushionField>[] = [
    { key: 'in-use', label: 'In use', decks: '–', rounds: '–', spread: '–', cushion: `${Math.round(inUse.priorRounds)} rounds` },
    ...(latestCushions?.cushions.map((c) => cushionRow(`cap-${c.cap}`, capLabel(c.cap), c)) ?? []),
  ];
  const weeklyCushions = refits.flatMap((r) => {
    const all = r.cushions.find((c) => c.cap === ALL_CAPS);
    return all ? [cushionRow(String(r.fittedAtMs), day(r.fittedAtMs), all)] : [];
  });

  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Duel level fit</h2>
      <p style={{ ...statsStyles.note, ...styles.intro, color: theme.text.tertiary }}>
        {latest
          ? `Refitted ${day(latest.fittedAtMs)} from the Duels of the last 30 days. ${applyingNote(applying)}`
          : 'No refit yet. The first runs 10 minutes after the server starts, then every Tuesday at 06:00 UTC.'}
        {inUse.appliedAtMs > 0 && ` The values in use were applied ${day(inUse.appliedAtMs)}.`}
      </p>
      <FitTable first="Cap" columns={LEVEL_COLUMNS} rows={currentLevels} />
      {weeklyLevels.length > 1 && (
        <>
          <h3 style={{ ...styles.subheading, color: theme.text.primary }}>All caps by refit</h3>
          <FitTable first="Refit" columns={LEVEL_COLUMNS} rows={weeklyLevels} />
        </>
      )}
      <h3 style={{ ...styles.subheading, color: theme.text.primary }}>Deck cushion</h3>
      <FitTable first="Cap" columns={CUSHION_COLUMNS} rows={currentCushions} />
      {weeklyCushions.length > 1 && (
        <>
          <h3 style={{ ...styles.subheading, color: theme.text.primary }}>Cushion by refit</h3>
          <FitTable first="Refit" columns={CUSHION_COLUMNS} rows={weeklyCushions} />
        </>
      )}
    </section>
  );
}

function FitTable<T extends string>({ first, columns, rows }: { first: string; columns: Column<T>[]; rows: Row<T>[] }) {
  const theme = getTheme();
  return (
    <div style={statsStyles.tableWrap}>
      <table style={statsStyles.table}>
        <thead>
          <tr style={{ color: theme.text.tertiary }}>
            <th style={statsStyles.th}>{first}</th>
            {columns.map((c) => (
              <th key={c.label} title={c.hint} style={statsStyles.thNumber}>
                <span style={statsStyles.hinted}>{c.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ color: theme.text.primary, borderTop: `1px solid ${theme.border}` }}>
              <td style={statsStyles.td}>{r.label}</td>
              {columns.map((c) => <td key={c.label} style={statsStyles.tdNumber}>{r[c.field]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  intro: {
    marginBottom: '8px',
  },
  subheading: {
    margin: '16px 0 8px',
    fontSize: '14px',
  },
};
