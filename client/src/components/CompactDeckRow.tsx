import type { CSSProperties } from 'react';
import type { BestDeckEntry } from '../api';
import type { Theme } from '../theme';
import { versionOf, cardIconUrl, avgElixir, orderBySlots } from '../lib/cardDisplay';
import { buildDeckLink } from '../lib/deckLink';
import CardTile from './CardTile';
import InfoTip from './InfoTip';
import { ElixirDropIcon } from './ElixirBadge';

interface CompactDeckRowProps {
  deck: BestDeckEntry;
  theme: Theme;
  isMobile: boolean;
  deckNumber?: number;
}

export default function CompactDeckRow({ deck, theme, isMobile, deckNumber }: CompactDeckRowProps) {
  const cards = orderBySlots(deck.cards, (id) => versionOf(deck.cardVersions, id));
  const accent = theme.accent;

  const openInGameLink = (style: CSSProperties) => (
    <a
      href={buildDeckLink(cards.map((c) => c.id))}
      target="_blank"
      rel="noopener noreferrer"
      className="deck-swap-btn"
      title="Open this deck in Clash Royale"
      aria-label="Open this deck in Clash Royale"
      style={style}
    >
      <svg viewBox="0 0 24 24" style={styles.openInGameIcon} aria-hidden="true">
        <path fill="currentColor" d="M8 5v14l11-7z" />
      </svg>
    </a>
  );

  const cardTiles = cards.map((card, index) => (
    <div key={card.id} style={styles.cardCell} title={card.name}>
      <CardTile
        name={card.name}
        iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
        slotIndex={index}
        elixirCost={card.elixirCost}
        nameColor={theme.text.primary}
      />
    </div>
  ));

  const metaScoreStat = (
    <div style={styles.stat}>
      <div style={{ ...styles.statLabel, color: theme.text.secondary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
        Meta Score
        <InfoTip ariaLabel="Meta score details" color={theme.text.secondary} width={210}>
          Confidence-adjusted win rate × popularity weight. Higher means this deck both wins more <em>and</em> is run by more top war players.
        </InfoTip>
      </div>
      <div style={{ ...styles.statValue, color: theme.text.primary }}>{deck.metaScore.toFixed(3)}</div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ ...styles.panel, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
        <div style={styles.panelHeader}>
          <h3 style={{ ...styles.panelTitle, color: theme.text.primary }}>Deck {deckNumber}</h3>
          <div style={styles.panelHeaderStats}>
            {openInGameLink({ ...styles.openInGame, width: '26px', height: '26px', boxShadow: 'none', border: '1px solid', borderColor: theme.border, color: accent })}
            <span style={{ ...styles.avgElixir, color: theme.text.secondary }}>
              <ElixirDropIcon />
              Avg {avgElixir(deck.cards).toFixed(1)}
            </span>
          </div>
        </div>
        <div style={styles.mobileGrid}>{cardTiles}</div>
        <div style={styles.mobileStats}>
          <Stat label="Win Rate" value={`${(deck.winRate * 100).toFixed(1)}%`} color={accent} theme={theme} />
          {metaScoreStat}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        ...styles.row,
        backgroundColor: 'var(--row-bg)',
        borderColor: 'var(--row-border)',
      }}
    >
      <div style={styles.desktopGrid}>{cardTiles}</div>

      <div style={styles.stats}>
        <Stat label="Win Rate" value={`${(deck.winRate * 100).toFixed(1)}%`} color={accent} theme={theme} />
        {metaScoreStat}
        <Stat label="Avg Elixir" value={avgElixir(deck.cards).toFixed(1)} color={theme.text.primary} theme={theme} />
      </div>

      {openInGameLink({
        ...styles.openInGame,
        border: '1px solid var(--chip-border)',
        backgroundColor: 'var(--float-btn-bg)',
        color: accent,
      })}
    </div>
  );
}

function Stat({ label, value, color, theme }: { label: string; value: string; color: string; theme: Theme }) {
  return (
    <div style={styles.stat}>
      <div style={{ ...styles.statLabel, color: theme.text.secondary }}>{label}</div>
      <div style={{ ...styles.statValue, color }}>{value}</div>
    </div>
  );
}

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
    padding: '10px 14px',
    borderRadius: '12px',
    border: '1px solid',
  },
  panel: {
    padding: '14px 12px',
    borderRadius: '12px',
    border: '1px solid',
  },
  panelHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginBottom: '16px',
    minHeight: '26px',
  },
  panelTitle: {
    margin: 0,
    fontSize: '16px',
  },
  panelHeaderStats: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
  },
  avgElixir: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '13px',
    fontWeight: 700 as const,
  },
  mobileGrid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  desktopGrid: {
    display: 'flex' as const,
    gap: '5px',
    flex: 1,
  },
  mobileStats: {
    display: 'flex' as const,
    justifyContent: 'space-around' as const,
    marginTop: '14px',
  },
  cardCell: {
    flex: 1,
    minWidth: 0,
  },
  stats: {
    display: 'flex' as const,
    gap: '18px',
    flexShrink: 0,
  },
  stat: {
    textAlign: 'center' as const,
  },
  statLabel: {
    fontSize: '10px',
    fontWeight: 600 as const,
    letterSpacing: '0.4px',
    textTransform: 'uppercase' as const,
    marginBottom: '3px',
  },
  statValue: {
    fontSize: '15px',
    fontWeight: 800 as const,
    lineHeight: 1.1,
  },
  openInGame: {
    flexShrink: 0,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    textDecoration: 'none',
    boxShadow: '0 2px 6px rgba(13, 27, 62, 0.12)',
  },
  openInGameIcon: {
    width: '14px',
    height: '14px',
    display: 'block',
  },
};
