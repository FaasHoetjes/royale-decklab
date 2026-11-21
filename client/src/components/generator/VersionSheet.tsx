import type { CSSProperties } from 'react';
import { specialChoices, type BuilderCard } from '../../lib/builderCards';
import { cardIconUrl, type CardVersion } from '../../lib/cardDisplay';
import type { IncludedVersion } from '../../lib/generatorOptions';
import { SPECIAL_COLOR } from '../../lib/slotStyles';
import { useIsMobile } from '../../hooks/useIsMobile';
import Sheet from '../Sheet';

export type VersionChoice = IncludedVersion | 'best';

const LABEL: Record<VersionChoice, string> = { best: 'Best', normal: 'Normal', evo: 'Evo', hero: 'Hero' };

interface VersionSheetProps {
  card: BuilderCard;
  /** How the card is included now; null while it isn't. */
  current: VersionChoice | null;
  onPick: (choice: VersionChoice) => void;
  onRemove: () => void;
  onClose: () => void;
}

/** Asks how an included card is played: one tap on a version includes it that way. */
export default function VersionSheet({ card, current, onPick, onRemove, onClose }: VersionSheetProps) {
  const isPhone = useIsMobile(640);
  const specials = specialChoices(card);
  const owned = specials.filter((s) => s.owned).map((s) => s.version);
  const art = (version: CardVersion) => cardIconUrl(card.iconUrls, version);
  const tiles: { choice: VersionChoice; note: string; disabled?: boolean }[] = [
    { choice: 'best', note: 'Suits each deck' },
    { choice: 'normal', note: 'No Evo or Hero' },
    ...specials.map((s) => ({ choice: s.version, note: s.owned ? `Always ${LABEL[s.version]}` : 'Not unlocked', disabled: !s.owned })),
  ];

  return (
    <Sheet
      title={`Play ${card.name} as`}
      overDialog
      onClose={onClose}
      footer={
        current && (
          <button type="button" onClick={onRemove} style={styles.remove}>
            Remove from include
          </button>
        )
      }
    >
      <p style={styles.hint}>Tap a version to include it.</p>
      <div style={{ ...styles.tiles, gridTemplateColumns: `repeat(${isPhone ? 2 : tiles.length}, minmax(0, 1fr))` }}>
        {tiles.map(({ choice, note, disabled }) => {
          const isCurrent = choice === current;
          return (
            <button
              key={choice}
              type="button"
              disabled={disabled}
              aria-pressed={isCurrent}
              onClick={() => onPick(choice)}
              style={{ ...styles.tile, ...(isCurrent ? currentTile(choice) : {}), ...(disabled ? styles.lockedTile : {}) }}
            >
              <span style={{ ...styles.picture, aspectRatio: isPhone ? '5 / 4' : '5 / 6' }}>
                {choice === 'best' ? (
                  ['normal' as const, ...owned].map((version, i, all) => (
                    <img key={version} src={art(version)} alt="" style={fanned(i, all.length)} />
                  ))
                ) : (
                  <img src={art(choice)} alt="" style={{ ...styles.art, ...styles.fill, ...(disabled ? styles.lockedArt : {}) }} />
                )}
              </span>
              {LABEL[choice]}
              <small style={styles.note}>{note}</small>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

function currentTile(choice: VersionChoice): CSSProperties {
  const color = choice === 'evo' || choice === 'hero' ? SPECIAL_COLOR[choice] : 'var(--accent)';
  return { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 10%, var(--bg-secondary))` };
}

// Best shows the versions it chooses between, fanned out like a hand of cards.
function fanned(index: number, count: number): CSSProperties {
  const offset = index - (count - 1) / 2;
  return {
    ...styles.art,
    position: 'absolute',
    inset: '6% 20%',
    width: '60%',
    height: '88%',
    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25))',
    transform: `rotate(${offset * 9}deg) translateX(${offset * 18}%)`,
  };
}

const styles = {
  hint: {
    margin: '0 0 14px',
    color: 'var(--text-secondary)',
    fontSize: '14px',
  },
  tiles: {
    display: 'grid' as const,
    gap: '10px',
  },
  tile: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    padding: '8px 8px 10px',
    border: '2px solid var(--border)',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
  lockedTile: {
    color: 'var(--text-tertiary)',
    cursor: 'not-allowed',
  },
  picture: {
    display: 'block',
    position: 'relative' as const,
    width: '100%',
    marginBottom: '6px',
  },
  art: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: '8px',
    objectFit: 'contain' as const,
  },
  fill: {
    position: 'absolute' as const,
    inset: 0,
  },
  lockedArt: {
    filter: 'grayscale(1)',
    opacity: 0.4,
  },
  note: {
    marginTop: '2px',
    color: 'var(--text-secondary)',
    fontSize: '11.5px',
    fontWeight: 500 as const,
    lineHeight: 1.3,
  },
  remove: {
    padding: '6px 0',
    border: 0,
    background: 'none',
    color: 'var(--down)',
    fontSize: '15px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
};
