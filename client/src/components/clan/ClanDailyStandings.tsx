import type { ClanWar } from '../../api';
import { water } from './RiverBanner';
import MedalIcon from './MedalIcon';

export default function ClanDailyStandings({ war }: { war: ClanWar }) {
  const clans = [...war.race].sort((a, b) => b.medalsToday - a.medalsToday);
  const maximum = Math.max(1, ...clans.map((clan) => clan.medalsToday));
  return <div style={{ marginTop: '18px' }}>
    <h3 style={{ fontSize: '14px', margin: '0 0 10px' }}>Today’s medals</h3>
    <ol aria-label="Today's clan medal standings" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {clans.map((clan) => {
        const ours = clan.tag === war.tag;
        const rank = 1 + clans.filter((other) => other.medalsToday > clan.medalsToday).length;
        return <li key={clan.tag} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', alignItems: 'center', gap: '10px', padding: '8px 0', fontSize: '13px', color: ours ? 'var(--accent)' : water.text }}>
          <span style={{ color: water.muted }}>{rank}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={clan.name}>{clan.name}</div>
            <div aria-hidden="true" style={{ height: '3px', background: water.line, marginTop: '5px', borderRadius: '3px' }}><div style={{ height: '100%', width: `${clan.medalsToday / maximum * 100}%`, background: ours ? 'var(--accent)' : water.muted, borderRadius: '3px' }} /></div>
          </div>
          <span role="img" aria-label={`${clan.medalsToday.toLocaleString('en-US')} medals today`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}><MedalIcon />{clan.medalsToday.toLocaleString('en-US')}</span>
        </li>;
      })}
    </ol>
  </div>;
}
