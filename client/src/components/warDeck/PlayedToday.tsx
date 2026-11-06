import type { CatalogCard } from '../../api';
import { getTheme } from '../../theme';
import { useAllCards, useWarDecksToday } from '../../queries';
import { cardIconUrl, orderBySlots, versionOf } from '../../lib/cardDisplay';
import { DECKS_PER_DAY } from '../../lib/clanWar';
import CardTile from '../CardTile';

interface PlayedTodayProps {
  playerTag: string;
  isMobile: boolean;
}

/** The war decks a player already used today; renders nothing until there are some, so the lineup never waits on it. */
const PlayedToday = ({ playerTag, isMobile }: PlayedTodayProps) => {
  const theme = getTheme();
  const today = useWarDecksToday(playerTag);
  const catalog = useAllCards();

  const decks = today.data?.decks ?? [];
  if (!today.data || decks.length === 0 || !catalog.data) return null;

  const byId = new Map(catalog.data.map((card) => [card.id, card]));
  const cardsOf = (ids: number[]) => ids.map((id) => byId.get(id)).filter((card): card is CatalogCard => card != null);

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
        <h3 style={{ ...styles.title, color: theme.text.primary }}>Played in war today</h3>
        <span style={{ ...styles.count, color: theme.text.secondary }}>
          {today.data.decksUsed} of {DECKS_PER_DAY} decks
        </span>
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
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    gap: '12px',
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
  decks: {
    display: 'grid' as const,
    gap: '12px 20px',
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
