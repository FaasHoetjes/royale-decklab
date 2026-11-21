import { useQuery } from '@tanstack/react-query';
import { fetchDuelLevels, type DuelLevelEstimate, type DuelLevelFit } from '../../api';
import { LEAGUES } from '../../lib/crownSeries';
import { getTheme } from '../../theme';
import { number } from './format';
import { HINTS } from './hints';
import { statsStyles } from './styles';

const STALE_MS = 10 * 60_000;

const ALL_CAPS = 0;

interface Row {
  key: string;
  label: string;
  duels: string;
  perLevel: string;
  weakestCard: string;
  evo: string;
  hero: string;
}

const COLUMNS: { label: string; hint: string; value: (r: Row) => string }[] = [
  { label: 'Duels', hint: HINTS.duelDuels, value: (r) => r.duels },
  { label: 'Per level', hint: HINTS.perLevel, value: (r) => r.perLevel },
  { label: 'Weakest card', hint: HINTS.weakestCard, value: (r) => r.weakestCard },
  { label: 'Evo', hint: HINTS.evo, value: (r) => r.evo },
  { label: 'Hero', hint: HINTS.hero, value: (r) => r.hero },
];

const estimate = (e: DuelLevelEstimate) => `${e.value.toFixed(2)} ± ${e.standardError.toFixed(2)}`;

const capLabel = (cap: number) =>
  cap === ALL_CAPS
    ? 'All caps'
    : `${cap} · ${LEAGUES.filter((l) => l.levelCap === cap).map((l) => l.name).join(', ')}`;

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const fitRow = (key: string, label: string, fit: DuelLevelFit): Row => ({
  key,
  label,
  duels: number(fit.duels),
  perLevel: estimate(fit.perLevel),
  weakestCard: estimate(fit.weakestCard),
  evo: estimate(fit.evo),
  hero: estimate(fit.hero),
});

export function DuelLevelsSection({ token }: { token: string }) {
  const theme = getTheme();
  const levels = useQuery({
    queryKey: ['admin-duel-levels', token],
    queryFn: ({ signal }) => fetchDuelLevels(token, signal),
    retry: false,
    staleTime: STALE_MS,
  });
  if (!levels.data) return null;

  const { inUse, refits } = levels.data;
  const latest = refits[0];
  const current: Row[] = [
    {
      key: 'in-use',
      label: 'In use',
      duels: '–',
      perLevel: inUse.perLevel.toFixed(2),
      weakestCard: inUse.weakestCard.toFixed(2),
      evo: inUse.evo.toFixed(2),
      hero: inUse.hero.toFixed(2),
    },
    ...(latest?.fits.map((f) => fitRow(`cap-${f.cap}`, capLabel(f.cap), f)) ?? []),
  ];
  const weekly = refits.flatMap((r) => {
    const all = r.fits.find((f) => f.cap === ALL_CAPS);
    return all ? [fitRow(String(r.fittedAtMs), day(r.fittedAtMs), all)] : [];
  });

  return (
    <section style={statsStyles.panel}>
      <h2 style={{ ...statsStyles.heading, color: theme.text.primary }}>Duel level fit</h2>
      <p style={{ ...statsStyles.note, ...styles.intro, color: theme.text.tertiary }}>
        {latest
          ? `Refitted ${day(latest.fittedAtMs)} from the Duels of the last 30 days. Scoring still uses the values in use; the refits are only recorded.`
          : 'No refit yet. The first runs 10 minutes after the server starts, then every Tuesday at 06:00 UTC.'}
      </p>
      <FitTable first="Cap" rows={current} />
      {weekly.length > 1 && (
        <>
          <h3 style={{ ...styles.subheading, color: theme.text.primary }}>All caps by refit</h3>
          <FitTable first="Refit" rows={weekly} />
        </>
      )}
    </section>
  );
}

function FitTable({ first, rows }: { first: string; rows: Row[] }) {
  const theme = getTheme();
  return (
    <div style={statsStyles.tableWrap}>
      <table style={statsStyles.table}>
        <thead>
          <tr style={{ color: theme.text.tertiary }}>
            <th style={statsStyles.th}>{first}</th>
            {COLUMNS.map((c) => (
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
              {COLUMNS.map((c) => <td key={c.label} style={statsStyles.tdNumber}>{c.value(r)}</td>)}
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
