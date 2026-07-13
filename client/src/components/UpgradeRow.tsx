import { useState } from 'react';
import CardTile from './CardTile';
import UnlockedDeckModal from './UnlockedDeckModal';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import type { UpgradeSuggestion } from '../api';
import type { Theme } from '../theme';

interface UpgradeRowProps {
  rank: number;
  suggestion: UpgradeSuggestion;
  relativeGain: number;
  baselineScore: number;
  theme: Theme;
  isMobile: boolean;
}

const UNLOCK_LABEL = {
  evo: { text: 'Unlock Evolution', color: '#a03cf0' },
  hero: { text: 'Unlock Hero', color: '#f5a623' },
} as const;

export default function UpgradeRow({
  rank,
  suggestion: s,
  relativeGain,
  baselineScore,
  theme,
  isMobile,
}: UpgradeRowProps) {
  const [showDeck, setShowDeck] = useState(false);
  const gainPct = baselineScore > 0 ? (s.scoreDelta / baselineScore) * 100 : 0;
  const decksLabel = s.affectedDeckIndexes.map((i) => `Deck ${i + 1}`).join(' · ');
  const unlock = s.kind === 'evo' || s.kind === 'hero' ? UNLOCK_LABEL[s.kind] : null;

  return (
    <>
    <div style={{ ...styles.row, padding: isMobile ? '12px 12px' : '14px 18px' }}>
      <div style={{ ...styles.rank, color: theme.text.secondary }}>#{rank}</div>
      <div style={{ width: isMobile ? '44px' : '54px', flexShrink: 0 }}>
        <CardTile
          name={s.name ?? ''}
          iconUrl={cardIconUrl(s.iconUrls, s.kind === 'level' ? 'normal' : s.kind)}
          showName={false}
        />
      </div>

      <div style={{ ...styles.infoWrap, gap: isMobile ? '10px' : '14px' }}>
        <div style={styles.info}>
          <div style={{ ...styles.name, color: theme.text.primary }}>{s.name}</div>
          {unlock ? (
            <div style={{ ...styles.levels, color: unlock.color, fontWeight: 700 }}>{unlock.text}</div>
          ) : (
            <div style={{ ...styles.levels, color: theme.text.secondary }}>
              Level {displayLevel(s.fromLevel, s.maxLevel)} → {displayLevel(s.toLevel, s.maxLevel)}
            </div>
          )}
          {(decksLabel || s.changesLineup) && (
            <div style={styles.context}>
              {decksLabel && <span style={{ color: theme.text.secondary }}>In {decksLabel}</span>}
              {s.changesLineup && (
                <span style={{ color: theme.accent, fontWeight: 600 }}>Unlocks a new deck</span>
              )}
            </div>
          )}
        </div>

        {s.unlockedDeck && (
          <button
            type="button"
            onClick={() => setShowDeck(true)}
            aria-label="Preview the deck this unlocks"
            title="Preview the deck this unlocks"
            className="mobile-touch-hitbox"
            style={{
              ...styles.eyeButton,
              width: isMobile ? '29px' : '34px',
              height: isMobile ? '29px' : '34px',
              color: theme.accent,
              borderColor: theme.border,
              backgroundColor: theme.bg.tertiary,
            }}
          >
            <EyeIcon size={isMobile ? 15 : 18} />
          </button>
        )}
      </div>

      {!isMobile && (
        <div style={{ ...styles.bar, backgroundColor: theme.bg.tertiary }}>
          <div
            style={{
              ...styles.barFill,
              width: `${Math.max(relativeGain * 100, 4)}%`,
              backgroundColor: theme.accent,
            }}
          />
        </div>
      )}

      <div style={styles.delta}>
        <div style={{ ...styles.deltaValue, color: theme.accent }}>+{s.scoreDelta.toFixed(3)}</div>
        <div style={{ ...styles.deltaPct, color: theme.text.secondary }}>+{gainPct.toFixed(1)}%</div>
      </div>
    </div>

    {showDeck && s.unlockedDeck && (
      <UnlockedDeckModal
        deck={s.unlockedDeck}
        cardName={s.name}
        onClose={() => setShowDeck(false)}
      />
    )}
    </>
  );
}

function EyeIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 576 512" style={{ width: size, height: size, display: 'block' }} aria-hidden="true">
      <path
        fill="currentColor"
        d="M288 32c-80.8 0-145.5 36.8-192.6 80.6C48.6 156 17.3 208 2.5 243.7c-3.3 7.9-3.3 16.7 0 24.6C17.3 304 48.6 356 95.4 399.4 142.5 443.2 207.2 480 288 480s145.5-36.8 192.6-80.6c46.8-43.5 78.1-95.4 92.9-131.1 3.3-7.9 3.3-16.7 0-24.6-14.8-35.7-46.1-87.7-92.9-131.1C433.5 68.8 368.8 32 288 32zM144 256a144 144 0 1 1 288 0 144 144 0 1 1 -288 0zm144-64c0 35.3-28.7 64-64 64-7.1 0-13.9-1.2-20.3-3.3-5.5-1.8-11.9 1.6-11.7 7.4.3 6.9 1.3 13.8 3.2 20.7 13.7 51.2 66.4 81.6 117.6 67.9s81.6-66.4 67.9-117.6c-11.1-41.5-47.8-69.4-88.6-71.1-5.8-.2-9.2 6.1-7.4 11.7 2.1 6.4 3.3 13.2 3.3 20.3z"
      />
    </svg>
  );
}

const styles = {
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
  },
  rank: {
    width: '26px',
    flexShrink: 0,
    fontSize: '13px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  infoWrap: {
    flex: 1,
    display: 'flex' as const,
    alignItems: 'center' as const,
    minWidth: 0,
  },
  info: {
    minWidth: 0,
  },
  name: {
    fontSize: '15px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  levels: {
    fontSize: '13px',
    marginTop: '2px',
  },
  context: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    fontSize: '12px',
    marginTop: '3px',
  },
  eyeButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 0,
    borderRadius: '8px',
    border: '1px solid',
    cursor: 'pointer' as const,
    flexShrink: 0,
  },
  bar: {
    width: '140px',
    height: '6px',
    borderRadius: '3px',
    overflow: 'hidden' as const,
    flexShrink: 0,
  },
  barFill: {
    height: '100%',
    borderRadius: '3px',
  },
  delta: {
    width: '64px',
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  deltaValue: {
    fontSize: '15px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  deltaPct: {
    fontSize: '11px',
    marginTop: '1px',
  },
};
