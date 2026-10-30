import type { CSSProperties } from 'react';
import type { BuilderDeckScore } from '../api';
import type { Theme } from '../theme';
import CardTile from './CardTile';
import { cardIconUrl } from '../lib/cardDisplay';
import type { BuilderCard } from '../lib/builderCards';
import { featuredCard } from '../lib/archetypes';
import { deckCards, type Deck } from '../lib/builderDecks';

interface BuilderDeckTabsProps {
  decks: Deck[];
  names: string[];
  scores: BuilderDeckScore[] | null;
  active: number;
  onSelect: (deckIndex: number) => void;
  cardById: Map<number, BuilderCard>;
  theme: Theme;
  isMobile: boolean;
}

export default function BuilderDeckTabs({ decks, names, scores, active, onSelect, cardById, theme, isMobile }: BuilderDeckTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Your four war decks"
      style={{
        ...styles.tabs,
        gap: isMobile ? '6px' : '10px',
        ...(isMobile && { ...styles.mobileSticky, backgroundColor: theme.bg.primary }),
      }}
    >
      {decks.map((deck, i) => {
        const featured = featuredCard(deckCards(deck, cardById));
        const selected = i === active;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={selected}
            data-deck-tab={i}
            className="wdb-tab"
            onClick={() => onSelect(i)}
            title={names[i]}
            style={{
              ...styles.tab,
              ...(isMobile ? styles.tabMobile : styles.tabDesktop),
              borderColor: selected ? theme.accent : theme.border,
              backgroundColor: selected ? 'color-mix(in srgb, var(--accent) 5%, var(--bg-secondary))' : theme.bg.secondary,
            }}
          >
            <div style={{ width: isMobile ? '30px' : '36px' }}>
              {featured ? (
                <CardTile name={featured.name} iconUrl={cardIconUrl(featured.iconUrls, 'normal')} showName={false} artStyle={styles.icon} />
              ) : (
                <div style={{ ...styles.emptyIcon, borderColor: theme.borderStrong, color: theme.text.tertiary }}>+</div>
              )}
            </div>
            <span style={{ minWidth: 0 }}>
              {!isMobile && (
                <span style={{ ...styles.name, color: selected ? theme.text.primary : theme.text.secondary }}>{names[i]}</span>
              )}
              <ScoreText score={scores?.[i]} theme={theme} style={{ fontSize: isMobile ? '13px' : '15px' }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ScoreText({ score, theme, style }: { score?: BuilderDeckScore; theme: Theme; style?: CSSProperties }) {
  if (!score || score.score == null) {
    return <span style={{ ...styles.score, ...style, color: theme.text.tertiary }}>–</span>;
  }
  return (
    <span style={{ ...styles.score, ...style, color: theme.text.primary }}>
      <span style={{ color: score.isMeta ? theme.text.primary : theme.text.tertiary }}>{score.isMeta ? '★' : '~'}</span>{' '}
      {score.score.toFixed(3)}
    </span>
  );
}

const styles = {
  tabs: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  mobileSticky: {
    position: 'sticky' as const,
    top: '62px',
    zIndex: 5,
    padding: '4px 0 8px',
  },
  tab: {
    display: 'grid' as const,
    alignItems: 'center' as const,
    textAlign: 'left' as const,
    border: '1px solid',
    borderRadius: '12px',
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer' as const,
    minWidth: 0,
  },
  tabDesktop: {
    gridTemplateColumns: '36px minmax(0, 1fr)',
    gap: '10px',
    padding: '10px 12px',
  },
  tabMobile: {
    gridTemplateColumns: '1fr',
    justifyItems: 'center' as const,
    textAlign: 'center' as const,
    gap: '5px',
    padding: '8px 4px',
  },
  icon: {
    borderRadius: '6px',
  },
  emptyIcon: {
    aspectRatio: '0.82',
    border: '1.5px dashed',
    borderRadius: '6px',
    display: 'grid' as const,
    placeItems: 'center' as const,
    fontSize: '14px',
  },
  name: {
    display: 'block' as const,
    fontSize: '13px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  score: {
    display: 'block' as const,
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
};
