import type { CatalogCard } from '../../api';
import { getTheme } from '../../theme';
import { useAllCards, useWarDecksToday } from '../../queries';
import { cardIconUrl, orderBySlots, versionOf } from '../../lib/cardDisplay';
import { DECKS_PER_DAY } from '../../lib/clanWar';
import { isPlannedAround, planRestOfToday, type GeneratorOptions } from '../../lib/generatorOptions';
import CardTile from '../CardTile';

interface PlayedTodayProps {
  playerTag: string;
  options: GeneratorOptions;
  onPlan: (options: GeneratorOptions) => void;
  isMobile: boolean;
}

/**
 * The war decks a player already used today, with a way to rebuild the lineup for the decks left; renders nothing
 * until there are some, so the lineup never waits on it.
 */
const PlayedToday = ({ playerTag, options, onPlan, isMobile }: PlayedTodayProps) => {
  const theme = getTheme();
  const today = useWarDecksToday(playerTag);
  const catalog = useAllCards();

  const decks = today.data?.decks ?? [];
  if (!today.data || decks.length === 0 || !catalog.data) return null;

  const byId = new Map(catalog.data.map((card) => [card.id, card]));
  const cardsOf = (ids: number[]) => ids.map((id) => byId.get(id)).filter((card): card is CatalogCard => card != null);
  const { decksUsed } = today.data;
  const playedCards = [...new Set(decks.flatMap((deck) => deck.cardIds))];
  const plan = planRestOfToday(options, decksUsed, playedCards);
  const isPlanned = isPlannedAround(options, decksUsed, playedCards);
  const decksLeft = DECKS_PER_DAY - decksUsed;

  return (
    <section
      aria-label="War decks played today"
      style={{
        ...styles.panel,
        padding: isMobile ? '14px' : '16px 20px',
        marginBottom: isMobile ? '16px' : '24px',
        borderColor: theme.border,
        backgroundColor: theme.bg.secondary,
      }}
    >
      <div style={styles.top}>
        <div>
          <h3 style={{ ...styles.title, color: theme.text.primary }}>
            {decksUsed} of {DECKS_PER_DAY} war decks played today
          </h3>
          <span style={{ ...styles.count, color: theme.text.secondary }}>
            {playedCards.length} cards are used up until the daily reset
          </span>
        </div>
        {plan && !isPlanned && (
          <button
            type="button"
            className="mobile-touch-target"
            onClick={() => onPlan(plan)}
            style={{ ...styles.plan, color: theme.onAccent, backgroundColor: theme.accent }}
          >
            {decksLeft === 1 ? 'Plan my last deck' : `Plan my last ${decksLeft} decks`}
          </button>
        )}
        {plan && isPlanned && (
          <span style={{ ...styles.planned, color: 'var(--up)' }}>✓ The lineup below skips these cards</span>
        )}
      </div>
      <div style={{ ...styles.decks, gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        {decks.map((deck) => {
          const cards = orderBySlots(cardsOf(deck.cardIds), (id) => versionOf(deck.cardVersions, id));
          return (
            <div key={deck.cardIds.join(',')} style={styles.deck}>
              {cards.map((card, index) => (
                <div key={card.id} style={styles.cell}>
                  <CardTile
                    name={card.name}
                    iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
                    slotIndex={index}
                    showName={false}
                    lazyLoad
                  />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PlayedToday;

const styles = {
  panel: {
    border: '1px solid',
    borderRadius: '14px',
  },
  top: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    gap: '10px 12px',
    marginBottom: '12px',
  },
  title: {
    margin: 0,
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  count: {
    fontSize: '13px',
  },
  plan: {
    border: 0,
    borderRadius: '10px',
    padding: '9px 14px',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
  },
  planned: {
    fontSize: '13px',
    fontWeight: 600 as const,
  },
  decks: {
    display: 'grid' as const,
    gap: '12px 20px',
    opacity: 0.6,
  },
  deck: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: '4px',
  },
  cell: {
    minWidth: 0,
  },
};
