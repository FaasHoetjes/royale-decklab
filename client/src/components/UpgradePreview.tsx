import { useRef } from 'react';
import CardTile from './CardTile';
import DeckLinkAction from './DeckLinkAction';
import { upgradeSlotIndex, upgradeStep } from './UpgradeRow';
import { cardIconUrl, orderBySlots, versionOf } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import { useTween } from '../hooks/useTween';
import type { UpgradeSuggestion } from '../api';
import type { Theme } from '../theme';

export interface LineupDeck {
  name: string;
  score: number;
  iconUrl: string;
}

interface UpgradePreviewProps {
  suggestion: UpgradeSuggestion;
  /** Changes on every pick, so the gain floats up again even for the same upgrade. */
  pick: number;
  baselineScore: number;
  lineup: LineupDeck[] | null;
  unlockedName: string;
  effect: string;
  theme: Theme;
  isMobile: boolean;
}

/** Shows what the picked upgrade does to the lineup: the new score, the deck it helps, or the deck it brings in. */
export default function UpgradePreview({ suggestion: s, pick, baselineScore, lineup, unlockedName, effect, theme, isMobile }: UpgradePreviewProps) {
  const score = useTween(s.newTotalScore, baselineScore);
  const bringsDeck = s.changesLineup && !!s.unlockedDeck;

  // The new deck stays rendered while its panel folds shut.
  const lastNew = useRef<{ s: UpgradeSuggestion; name: string; pick: number } | null>(null);
  if (bringsDeck) lastNew.current = { s, name: unlockedName, pick };
  const shown = lastNew.current;

  return (
    <section
      aria-live="polite"
      style={{
        ...styles.panel,
        top: isMobile ? '62px' : '16px',
        padding: isMobile ? '14px' : '22px 22px 20px',
        backgroundColor: theme.bg.secondary,
      }}
    >
      <div style={{ ...styles.top, gridTemplateColumns: isMobile ? '46px minmax(0, 1fr) auto' : '60px minmax(0, 1fr) auto', gap: isMobile ? '12px' : '16px' }}>
        <CardTile
          name={s.name ?? ''}
          iconUrl={cardIconUrl(s.iconUrls, s.kind === 'level' ? 'normal' : s.kind)}
          slotIndex={upgradeSlotIndex(s)}
          showName={false}
          fetchPriority="high"
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ ...styles.over, color: theme.text.tertiary }}>If you upgrade</div>
          <div style={{ ...styles.name, fontSize: isMobile ? '16px' : '19px', color: theme.text.primary }}>
            {s.name} · {upgradeStep(s)}
          </div>
          {!isMobile && <div style={{ ...styles.effect, color: theme.text.secondary }}>{sentence(effect)}</div>}
        </div>
        <div style={styles.scoreWrap}>
          <span key={pick} className="ua-float" style={{ ...styles.float, color: theme.text.primary }} aria-hidden="true">
            +{s.scoreDelta.toFixed(3)}
          </span>
          <div style={{ ...styles.score, fontSize: isMobile ? '28px' : '36px', color: theme.text.primary }}>{score.toFixed(3)}</div>
          <div style={{ ...styles.scoreLabel, color: theme.text.tertiary }}>
            {isMobile ? 'up from ' : 'new lineup score, up from '}
            <span style={styles.digits}>{baselineScore.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {lineup && (
        <div style={{ ...styles.slots, gap: isMobile ? '6px' : '10px', marginTop: isMobile ? '14px' : '20px' }}>
          {lineup.map((deck, i) => {
            const hit = !bringsDeck && s.affectedDeckIndexes.includes(i);
            const gain = hit && s.affectedDeckIndexes.length === 1 ? s.scoreDelta : 0;
            return <DeckSlot key={i} deck={deck} hit={hit} gain={gain} pick={pick} theme={theme} isMobile={isMobile} />;
          })}
        </div>
      )}

      <div style={{ ...styles.fold, gridTemplateRows: bringsDeck ? '1fr' : '0fr' }}>
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          {shown?.s.unlockedDeck && <NewDeck key={shown.pick} suggestion={shown.s} name={shown.name} theme={theme} isMobile={isMobile} />}
        </div>
      </div>
    </section>
  );
}

function sentence(effect: string): string {
  return effect.charAt(0).toUpperCase() + effect.slice(1);
}

function DeckSlot({ deck, hit, gain, pick, theme, isMobile }: { deck: LineupDeck; hit: boolean; gain: number; pick: number; theme: Theme; isMobile: boolean }) {
  const score = useTween(deck.score + gain, deck.score);
  return (
    <div
      key={hit ? pick : 'idle'}
      className={hit ? 'ua-slot-hit' : undefined}
      title={deck.name}
      style={{
        ...styles.slot,
        gridTemplateColumns: isMobile ? '22px minmax(0, 1fr)' : '28px minmax(0, 1fr)',
        padding: isMobile ? '7px 8px' : '10px 12px',
        opacity: hit ? 1 : 0.45,
        borderColor: hit ? theme.accent : theme.border,
        backgroundColor: hit ? 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))' : theme.bg.primary,
      }}
    >
      <div style={{ gridRow: isMobile ? undefined : 'span 2' }}>
        <CardTile name={deck.name} iconUrl={deck.iconUrl} showName={false} artStyle={styles.slotTile} />
      </div>
      {!isMobile && <div style={{ ...styles.slotName, color: theme.text.secondary }}>{deck.name}</div>}
      <div style={{ ...styles.slotScore, fontSize: isMobile ? '13px' : '15px', color: theme.text.primary }}>
        {score.toFixed(3)}
      </div>
    </div>
  );
}

function NewDeck({ suggestion: s, name, theme, isMobile }: { suggestion: UpgradeSuggestion; name: string; theme: Theme; isMobile: boolean }) {
  const deck = s.unlockedDeck!;
  const cards = orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id));
  return (
    <div
      style={{
        ...styles.newDeck,
        padding: isMobile ? '12px' : '14px 16px 16px',
        borderColor: theme.accent,
        backgroundColor: 'color-mix(in srgb, var(--accent) 5%, var(--bg-primary))',
      }}
    >
      <div style={styles.newHead}>
        <div style={{ minWidth: 0 }}>
          <div style={{ ...styles.newTag, color: theme.text.secondary }}>New deck in your lineup</div>
          <div style={{ ...styles.newName, color: theme.text.primary }}>{name}</div>
        </div>
        <div style={{ ...styles.newStats, color: theme.text.secondary }}>
          deck score <span style={styles.digits}>{deck.metaScore.toFixed(3)}</span> · <span style={styles.digits}>{Math.round(deck.winRate * 100)}</span>% winrate
        </div>
      </div>
      <div style={{ ...styles.cards, gap: isMobile ? '5px' : '8px' }}>
        {cards.map((card, i) => (
          <div key={card.id} className="ua-pop" style={{ minWidth: 0, animationDelay: `${i * 45}ms` }} title={card.name}>
            <CardTile
              name={card.name}
              iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
              slotIndex={i}
              showName={false}
              artStyle={card.id === s.cardId ? { ...styles.upgraded, outlineColor: theme.text.primary } : undefined}
            />
          </div>
        ))}
      </div>
      <DeckLinkAction
        link={buildDeckLink(cards.map((c) => c.id))}
        isMobile={isMobile}
        className="mobile-touch-target"
        style={{ ...styles.deckLink, color: theme.text.primary }}
        label={isMobile ? 'Open in Clash Royale' : 'Copy deck link'}
      />
    </div>
  );
}

const styles = {
  panel: {
    position: 'sticky' as const,
    zIndex: 5,
    border: '1px solid var(--panel-border)',
    borderRadius: '18px',
    boxShadow: 'var(--panel-shadow)',
    marginBottom: '28px',
  },
  top: {
    display: 'grid' as const,
    alignItems: 'center' as const,
  },
  over: {
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  name: {
    fontWeight: 700 as const,
    marginTop: '1px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  effect: {
    fontSize: '13px',
    marginTop: '3px',
    lineHeight: 1.4,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  scoreWrap: {
    position: 'relative' as const,
    textAlign: 'right' as const,
  },
  float: {
    position: 'absolute' as const,
    right: 0,
    top: '-6px',
    fontSize: '20px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    pointerEvents: 'none' as const,
    opacity: 0,
  },
  score: {
    fontWeight: 700 as const,
    lineHeight: 1,
    letterSpacing: '-0.5px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  scoreLabel: {
    fontSize: '12px',
    marginTop: '4px',
    whiteSpace: 'nowrap' as const,
  },
  digits: {
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  slots: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  slot: {
    display: 'grid' as const,
    alignItems: 'center' as const,
    gap: '2px 10px',
    border: '1px solid',
    borderRadius: '12px',
    transition: 'opacity 0.3s ease, border-color 0.3s ease, background-color 0.3s ease',
  },
  slotTile: {
    borderRadius: '6px',
  },
  slotName: {
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  slotScore: {
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  fold: {
    display: 'grid' as const,
    transition: 'grid-template-rows 0.35s ease',
  },
  newDeck: {
    marginTop: '12px',
    border: '1px dashed',
    borderRadius: '12px',
  },
  newHead: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'baseline' as const,
    flexWrap: 'wrap' as const,
    gap: '4px 12px',
    marginBottom: '12px',
  },
  newTag: {
    fontSize: '12px',
    fontWeight: 600 as const,
  },
  newName: {
    fontSize: '14px',
    fontWeight: 700 as const,
    marginTop: '1px',
  },
  newStats: {
    fontSize: '12.5px',
  },
  cards: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, minmax(0, 1fr))',
    maxWidth: '440px',
  },
  upgraded: {
    outline: '2px solid',
    outlineOffset: '2px',
  },
  deckLink: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    marginTop: '12px',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    cursor: 'pointer' as const,
  },
};
