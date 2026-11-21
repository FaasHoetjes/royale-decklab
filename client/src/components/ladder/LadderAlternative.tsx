import type { ScoredDeck } from '../../api';
import { cardIconUrl, orderBySlots, slotVersionOf, versionOf } from '../../lib/cardDisplay';
import { buildDeckLink } from '../../lib/deckLink';
import CardLink from '../CardLink';
import CardTile from '../CardTile';
import DeckLinkAction from '../DeckLinkAction';

interface LadderAlternativeProps {
  deck: ScoredDeck;
  name: string;
  isMobile: boolean;
}

/** Below this many players, a deck's record may be one player's streak. */
const FEW_PLAYERS = 3;

/** Another strong deck on one line: its name and record, its cards, and its win chance. */
export default function LadderAlternative({ deck, name, isMobile }: LadderAlternativeProps) {
  const cards = orderBySlots(deck.cards, slotVersionOf(deck.metaCardVersions, deck.cardVersions));
  const players = deck.players === 1 ? 'player' : 'players';

  return (
    <div style={{ ...styles.row, gridTemplateColumns: isMobile ? 'minmax(0, 1fr) auto' : 'minmax(0, 150px) minmax(0, 1fr) 56px auto' }}>
      <div style={{ minWidth: 0 }}>
        <div style={styles.name}>{name}</div>
        <div style={styles.meta}>
          {deck.uses.toLocaleString()} games · {deck.players} {players}
          {deck.players < FEW_PLAYERS && <span style={styles.few}> · few players</span>}
        </div>
      </div>
      <div style={{ ...styles.cards, ...(isMobile ? styles.cardsMobile : {}) }}>
        {cards.map((card, index) => (
          <CardLink key={card.id} name={card.name}>
            <CardTile
              name={card.name}
              iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
              slotIndex={index}
              showName={false}
              lazyLoad
            />
          </CardLink>
        ))}
      </div>
      <div className="ladder-number" style={{ ...styles.chance, ...(isMobile ? styles.chanceMobile : {}) }} title="Your win chance">
        {Math.round(deck.playerScore * 100)}%
      </div>
      <DeckLinkAction
        link={buildDeckLink(cards.map((c) => c.id))}
        isMobile={isMobile}
        className="mobile-touch-target"
        style={{ ...styles.action, ...(isMobile ? styles.actionMobile : {}) }}
        label={isMobile ? 'Open in game' : undefined}
      />
    </div>
  );
}

const styles = {
  row: {
    display: 'grid' as const,
    gap: '10px 14px',
    alignItems: 'center' as const,
    padding: '10px 14px',
    borderRadius: '14px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  name: {
    fontWeight: 700 as const,
    fontSize: '14px',
    color: 'var(--text-primary)',
  },
  meta: {
    fontSize: '12px',
    color: 'var(--text-tertiary)',
  },
  few: {
    color: 'var(--text-secondary)',
    fontWeight: 600 as const,
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: '5px',
  },
  cardsMobile: {
    gridColumn: '1 / -1',
    gridRow: 2,
  },
  chance: {
    fontSize: '20px',
    textAlign: 'right' as const,
    color: 'var(--accent)',
  },
  chanceMobile: {
    gridColumn: 2,
    gridRow: 1,
  },
  action: {
    height: '34px',
    minWidth: '34px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    padding: '0 9px',
    borderRadius: '10px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
  actionMobile: {
    gridColumn: '1 / -1',
    gridRow: 3,
  },
};
