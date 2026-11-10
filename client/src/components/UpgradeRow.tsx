import CardTile from './CardTile';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import { SPECIAL_COLOR } from '../lib/slotStyles';
import type { UpgradeSuggestion } from '../api';
import type { Theme } from '../theme';

interface UpgradeRowProps {
  rank: number;
  suggestion: UpgradeSuggestion;
  /** What the upgrade does, e.g. "strengthens Graveyard Cycle". */
  effect: string;
  selected: boolean;
  onSelect: () => void;
  theme: Theme;
  isMobile: boolean;
}

const UNLOCK_LABEL = {
  evo: { text: 'Unlock Evolution', color: SPECIAL_COLOR.evo },
  hero: { text: 'Unlock Hero', color: SPECIAL_COLOR.hero },
} as const;

export function upgradeSlotIndex(s: UpgradeSuggestion): number | undefined {
  if (s.kind === 'evo') return 0;
  if (s.kind === 'hero') return 1;
  return undefined;
}

export function upgradeStep(s: UpgradeSuggestion): string {
  if (s.kind === 'evo') return 'Evolution';
  if (s.kind === 'hero') return 'Hero';
  return `${displayLevel(s.fromLevel, s.maxLevel)} → ${displayLevel(s.toLevel, s.maxLevel)}`;
}

export default function UpgradeRow({ rank, suggestion: s, effect, selected, onSelect, theme, isMobile }: UpgradeRowProps) {
  const unlock = s.kind === 'evo' || s.kind === 'hero' ? UNLOCK_LABEL[s.kind] : null;

  return (
    <button
      type="button"
      className="ua-row"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        ...styles.row,
        gridTemplateColumns: isMobile ? '18px 36px minmax(0, 1fr) auto' : '22px 36px minmax(0, 1fr) auto',
        gap: isMobile ? '12px' : '14px',
        padding: isMobile ? '11px 8px' : '11px 10px',
        borderBottomColor: selected ? 'transparent' : theme.borderStrong,
        backgroundColor: selected ? theme.bg.secondary : 'transparent',
        borderRadius: selected ? '10px' : 0,
      }}
    >
      {selected && <span style={{ ...styles.marker, backgroundColor: theme.accent }} />}
      <span style={{ ...styles.rank, color: theme.text.tertiary }}>{rank}</span>
      <CardTile
        name={s.name ?? ''}
        iconUrl={cardIconUrl(s.iconUrls, s.kind === 'level' ? 'normal' : s.kind)}
        slotIndex={upgradeSlotIndex(s)}
        showName={false}
        lazyLoad={rank > 10}
        artStyle={styles.tile}
      />
      <span style={styles.info}>
        <span style={{ ...styles.name, color: theme.text.primary }}>{s.name}</span>
        <span style={{ ...styles.sub, color: theme.text.secondary }}>
          {unlock ? (
            <span style={{ color: unlock.color, fontWeight: 600 }}>{unlock.text}</span>
          ) : (
            `Level ${upgradeStep(s)}`
          )}
          {' · '}
          {effect}
        </span>
      </span>
      <span style={{ ...styles.gain, color: theme.text.primary }}>+{s.scoreDelta.toFixed(3)}</span>
    </button>
  );
}

const styles = {
  row: {
    position: 'relative' as const,
    width: '100%',
    display: 'grid' as const,
    alignItems: 'center' as const,
    textAlign: 'left' as const,
    font: 'inherit',
    color: 'inherit',
    border: 'none',
    borderBottom: '1px solid',
    cursor: 'pointer' as const,
  },
  marker: {
    position: 'absolute' as const,
    left: 0,
    top: '10px',
    bottom: '10px',
    width: '3px',
    borderRadius: '3px',
  },
  rank: {
    fontSize: '13px',
    fontWeight: 600 as const,
    textAlign: 'center' as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  tile: {
    borderRadius: '8px',
  },
  info: {
    minWidth: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '1px',
  },
  name: {
    fontSize: '14px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  sub: {
    fontSize: '12.5px',
    lineHeight: 1.4,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  gain: {
    fontSize: '15px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
