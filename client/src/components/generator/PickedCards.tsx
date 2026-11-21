import { hasVersionChoice, type BuilderCard } from '../../lib/builderCards';
import type { IncludedVersion } from '../../lib/generatorOptions';
import { SPECIAL_COLOR } from '../../lib/slotStyles';
import CardAvatar from './CardAvatar';
import { CrossIcon } from './icons';

const VERSION_LABEL: Record<IncludedVersion, string> = { normal: 'Normal', evo: 'Evo', hero: 'Hero' };

interface PickedCardsProps {
  picks: number[];
  cardById: Map<number, BuilderCard>;
  cardName: (id: number) => string;
  label: string;
  dim: boolean;
  onRemove: (id: number) => void;
  /** Included cards only: the version each is played as, changed by tapping the card. */
  versions?: Record<number, IncludedVersion>;
  onEditVersion?: (id: number) => void;
}

export default function PickedCards({ picks, cardById, cardName, label, dim, onRemove, versions, onEditVersion }: PickedCardsProps) {
  return (
    <div style={styles.picks} role="group" aria-label={`${label}d cards`}>
      {picks.map((id) => {
        const card = cardById.get(id);
        const version = versions?.[id];
        const canEdit = onEditVersion != null && hasVersionChoice(card);
        const name = (
          <>
            <CardAvatar card={card} dim={dim} small version={version === 'evo' || version === 'hero' ? version : 'normal'} />
            {cardName(id)}
            {canEdit && (
              <span style={{ ...styles.version, ...(version === 'evo' || version === 'hero' ? { color: SPECIAL_COLOR[version] } : {}) }}>
                {version ? VERSION_LABEL[version] : 'Best'}
              </span>
            )}
          </>
        );
        return (
          <span key={id} style={styles.pick}>
            {canEdit ? (
              <button type="button" onClick={() => onEditVersion(id)} aria-label={`Change how ${cardName(id)} is played`} style={styles.edit}>
                {name}
              </button>
            ) : (
              <span style={styles.edit}>{name}</span>
            )}
            <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${cardName(id)}`} className="mobile-touch-hitbox" style={styles.remove}>
              <CrossIcon />
            </button>
          </span>
        );
      })}
    </div>
  );
}

const styles = {
  picks: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border)',
  },
  pick: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    height: '34px',
    padding: '0 2px 0 4px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-tertiary)',
  },
  edit: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    height: '100%',
    padding: 0,
    border: 0,
    background: 'none',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer',
  },
  version: {
    padding: '1px 7px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-secondary)',
    fontSize: '11px',
    fontWeight: 700 as const,
  },
  remove: {
    width: '28px',
    height: '28px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    border: 0,
    borderRadius: '50%',
    background: 'none',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
};
