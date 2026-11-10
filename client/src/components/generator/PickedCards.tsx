import type { BuilderCard } from '../../lib/builderCards';
import CardAvatar from './CardAvatar';
import { CrossIcon } from './icons';

interface PickedCardsProps {
  picks: number[];
  cardById: Map<number, BuilderCard>;
  cardName: (id: number) => string;
  label: string;
  dim: boolean;
  onRemove: (id: number) => void;
}

export default function PickedCards({ picks, cardById, cardName, label, dim, onRemove }: PickedCardsProps) {
  return (
    <div style={styles.picks} role="group" aria-label={`${label}d cards`}>
      {picks.map((id) => (
        <span key={id} style={styles.pick}>
          <CardAvatar card={cardById.get(id)} dim={dim} small />
          {cardName(id)}
          <button type="button" onClick={() => onRemove(id)} aria-label={`Remove ${cardName(id)}`} className="mobile-touch-hitbox" style={styles.remove}>
            <CrossIcon />
          </button>
        </span>
      ))}
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
    gap: '6px',
    height: '34px',
    padding: '0 2px 0 4px',
    borderRadius: '99px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
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
    color: 'inherit',
    cursor: 'pointer',
  },
};
