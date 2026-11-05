import { memo, useRef, useState } from 'react';
import { getTheme } from '../theme';
import type { BestDeckSet } from '../api';
import { deckKey } from '../lib/generatorOptions';
import { slideFold } from '../lib/motion';
import GeneratorHeader from '../components/GeneratorHeader';
import BestDeckRow from '../components/BestDeckRow';

interface SetSectionProps {
  set: BestDeckSet;
  setKey: string;
  setIdx: number;
  expanded: boolean;
  deckNames: Map<string, string | undefined>;
  isMobile: boolean;
  copying: boolean;
  copyBusy: boolean;
  onToggle: (key: string) => void;
  onCopy: (set: BestDeckSet, setIdx: number) => void;
}

// Memoized so folding one set re-renders that set, not all ten.
export const SetSection = memo(function SetSection({ set, setKey, setIdx, expanded, deckNames, isMobile, copying, copyBusy, onToggle, onCopy }: SetSectionProps) {
  const theme = getTheme();
  const decksRef = useRef<HTMLDivElement>(null);
  // Lags `expanded` while the decks slide shut, so the chevron turns right away but the decks stay until covered.
  const [decksShown, setDecksShown] = useState(expanded);
  const rowsId = `best-set-${setIdx + 1}-decks`;

  function toggle() {
    const open = !expanded;
    onToggle(setKey);
    slideFold(decksRef.current!, open, () => setDecksShown(open));
  }

  return (
    <section>
      <GeneratorHeader
        eyebrow={null}
        decks={set.decks}
        totalScore={set.totalScore}
        scoreTip="The four decks' meta scores added up. Sets are ranked by it."
        isMobile={isMobile}
        style={{ marginBottom: 0, ...(isMobile ? {} : { minHeight: '118px' }) }}
        toggle={{
          expanded,
          onToggle: toggle,
          controls: rowsId,
          label: `${expanded ? 'Hide' : 'Show'} the decks of set ${setIdx + 1}`,
        }}
      >
        <button
          type="button"
          className="glass-btn mobile-touch-target"
          onClick={() => onCopy(set, setIdx)}
          disabled={copyBusy}
          style={{
            ...styles.useButton,
            cursor: copyBusy ? 'wait' : 'pointer',
            opacity: copyBusy && !copying ? 0.6 : 1,
          }}
        >
          <BuilderIcon spinning={copying} />
          Use set in builder
        </button>
      </GeneratorHeader>

      <div
        ref={decksRef}
        id={rowsId}
        style={{ ...styles.rowList, padding: isMobile ? '12px 0 18px' : '12px 0 20px', display: decksShown ? 'flex' : 'none' }}
      >
        {set.decks.map((deck, deckIdx) => (
          <BestDeckRow
            key={deckIdx}
            deck={deck}
            name={deckNames.get(deckKey(deck.cardIds)) ?? `Deck ${deckIdx + 1}`}
            theme={theme}
            isMobile={isMobile}
            lazyLoad={setIdx > 0}
          />
        ))}
      </div>
    </section>
  );
});

function BuilderIcon({ spinning }: { spinning: boolean }) {
  if (spinning) {
    return (
      <svg viewBox="0 0 24 24" style={{ ...styles.icon, animation: 'spin 1s linear infinite' }} aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40 20" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" style={styles.icon} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
    </svg>
  );
}

const styles = {
  useButton: {
    alignSelf: 'flex-start' as const,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    marginTop: '10px',
    height: '34px',
    padding: '0 13px',
    border: '1px solid color-mix(in srgb, var(--hero-text) 20%, transparent)',
    borderRadius: '999px',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 62%, transparent)',
    backdropFilter: 'blur(10px)',
    color: 'var(--hero-text)',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
  },
  icon: {
    width: '14px',
    height: '14px',
    display: 'block' as const,
    flexShrink: 0,
    color: 'var(--accent)',
  },
  rowList: {
    flexDirection: 'column' as const,
    gap: '10px',
    isolation: 'isolate' as const,
  },
};
