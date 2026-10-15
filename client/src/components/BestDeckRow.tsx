import type { BestDeckEntry } from '../api';
import type { Theme } from '../theme';
import { versionOf, cardIconUrl, avgElixir, orderBySlots } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import CardTile from './CardTile';
import InfoTip from './InfoTip';
import DeckLinkAction from './DeckLinkAction';

interface BestDeckRowProps {
  deck: BestDeckEntry;
  name: string;
  theme: Theme;
  isMobile: boolean;
}

/** One deck of a best set: its name and stats, the eight cards, and the link to open it in game. */
export default function BestDeckRow({ deck, name, theme, isMobile }: BestDeckRowProps) {
  const cards = orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id));
  const deckLink = buildDeckLink(cards.map((c) => c.id));

  const title = (
    <h3 style={{ ...styles.name, minWidth: 0, color: theme.text.primary }}>{name}</h3>
  );

  const stats = (
    <div style={{ ...styles.stats, ...(isMobile ? styles.statsMobile : {}) }}>
      <div style={{ ...styles.lead, alignItems: isMobile ? 'flex-end' : 'flex-start' }}>
        <span style={{ ...styles.statLabel, color: theme.text.secondary }}>
          Meta score
          <InfoTip ariaLabel="Meta score details" color={theme.text.secondary} width={210} align={isMobile ? 'right' : undefined}>
            Cautious win rate: each record is weighed against 80 average games and rated at the level the deck is 75% likely to reach, so a few lucky wins can't outrank a proven deck.
          </InfoTip>
        </span>
        <span style={{ ...styles.leadValue, color: theme.text.primary }}>{deck.metaScore.toFixed(3)}</span>
      </div>
      <div style={{ ...styles.rest, color: theme.text.secondary }}>
        <span style={styles.restStat}>
          <b style={{ ...styles.restValue, color: theme.text.primary }}>{(deck.winRate * 100).toFixed(1)}%</b> win rate
        </span>
        <span style={styles.restStat}>
          <b style={{ ...styles.restValue, color: theme.text.primary }}>{avgElixir(deck.cards).toFixed(1)}</b> elixir
        </span>
      </div>
    </div>
  );

  const cardTiles = (
    <div style={{ ...styles.cards, ...(isMobile ? styles.cardsMobile : {}) }}>
      {cards.map((card, index) => (
        <div key={card.id} style={{ minWidth: 0 }} title={card.name}>
          <CardTile
            name={card.name}
            iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
            slotIndex={index}
            elixirCost={card.elixirCost}
            nameColor={theme.text.primary}
          />
        </div>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ ...styles.row, ...styles.rowMobile }}>
        <div style={styles.infoMobile}>
          {title}
          {stats}
        </div>
        {cardTiles}
        <DeckLinkAction
          link={deckLink}
          isMobile
          className="mobile-touch-target"
          style={{ ...styles.openInGameFull, color: theme.accent }}
          label="Open in Clash Royale"
        />
      </div>
    );
  }

  return (
    <div style={styles.row}>
      <div style={styles.info}>
        {title}
        {stats}
      </div>
      {cardTiles}
      <DeckLinkAction link={deckLink} isMobile={false} linkIcon style={{ ...styles.copyLink, color: theme.accent }} />
    </div>
  );
}

const styles = {
  row: {
    display: 'grid' as const,
    gridTemplateColumns: '210px minmax(0, 1fr) auto',
    alignItems: 'center' as const,
    gap: '18px',
    padding: '12px 14px 12px 18px',
    borderRadius: '16px',
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
  },
  rowMobile: {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: '14px',
    padding: '14px 12px',
  },
  info: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
    minWidth: 0,
  },
  infoMobile: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: '12px',
  },
  name: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 700 as const,
    lineHeight: 1.2,
    overflowWrap: 'anywhere' as const,
  },
  stats: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
  },
  statsMobile: {
    alignItems: 'flex-end' as const,
    flexShrink: 0,
  },
  lead: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '4px',
  },
  statLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '12px',
    fontWeight: 500 as const,
  },
  leadValue: {
    fontSize: '20px',
    fontWeight: 700 as const,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  rest: {
    display: 'flex' as const,
    gap: '12px',
    fontSize: '13px',
  },
  restStat: {
    display: 'inline-flex' as const,
    alignItems: 'baseline' as const,
    gap: '4px',
    whiteSpace: 'nowrap' as const,
  },
  restValue: {
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    gap: '6px',
  },
  cardsMobile: {
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px 8px',
  },
  copyLink: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '40px',
    height: '40px',
    padding: 0,
    borderRadius: '12px',
    border: 'none',
    backgroundColor: 'var(--icon-btn-bg)',
    boxShadow: '0 1px 3px rgba(13, 27, 62, 0.12)',
    cursor: 'pointer',
  },
  openInGameFull: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '8px',
    padding: '11px 12px',
    borderRadius: '10px',
    border: '1px solid var(--row-border)',
    backgroundColor: 'var(--raised-bg)',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
};
