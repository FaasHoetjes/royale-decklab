import type { DragEvent } from 'react';
import type { Theme } from '../theme';
import { availableVersions, type BuilderCard } from '../lib/builderCards';
import { cardIconUrl, displayLevel } from '../lib/cardDisplay';
import { slotKind, slotBorderStyle } from '../lib/slotStyles';
import type { SpecialVersion } from '../lib/deckBoard';
import CardTile from './CardTile';

interface DeckSlotProps {
  card: BuilderCard | null;
  slotIndex: number;
  isDarkMode: boolean;
  theme: Theme;
  /** The slot's saved evo/hero art choice, if any. */
  versionOverride?: SpecialVersion;
  isDragging: boolean;
  isDropTarget: boolean;
  isInvalidDropTarget: boolean;
  onClick: () => void;
  onToggleVersion: (versions: SpecialVersion[]) => void;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
}

/**
 * One builder slot: click to add/remove, drag to swap. A filled "both" slot
 * whose card has both specials unlocked shows a toggle to pick the art.
 */
export default function DeckSlot({
  card,
  slotIndex,
  isDarkMode,
  theme,
  versionOverride,
  isDragging,
  isDropTarget,
  isInvalidDropTarget,
  onClick,
  onToggleVersion,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: DeckSlotProps) {
  const kind = slotKind(slotIndex);
  const versions = card ? availableVersions(card, kind) : [];
  const activeVersion =
    versionOverride && versions.includes(versionOverride) ? versionOverride : versions[0];
  const canToggle = versions.length > 1;

  const level = card && card.level != null ? displayLevel(card.level, card.maxLevel ?? 16) : null;
  const dropOutline = isInvalidDropTarget
    ? styles.dropTargetInvalid
    : isDropTarget
      ? styles.dropTarget
      : {};

  return (
    <button
      className="deck-slot-btn"
      onClick={onClick}
      draggable={card != null}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        ...styles.slot,
        cursor: card ? 'grab' : 'pointer',
        opacity: isDragging ? 0.4 : 1,
      }}
      title={
        card
          ? `${card.name}${level != null ? ` · Level ${level}/16` : ''} (drag to swap · click to remove)`
          : 'Click to add a card'
      }
    >
      {card ? (
        <CardTile
          name={card.name}
          iconUrl={cardIconUrl(card.iconUrls, activeVersion ?? 'normal')}
          isDarkMode={isDarkMode}
          slotIndex={slotIndex}
          elixirCost={card.elixirCost}
          level={level}
          nameColor={theme.text.primary}
          artStyle={dropOutline}
        >
          {canToggle && (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Showing ${activeVersion} art, switch version`}
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                onToggleVersion(versions);
              }}
              // A span (not a real <button>) because it sits inside the slot's
              // <button>, so Enter/Space need wiring by hand. stopPropagation
              // keeps the keypress from also triggering the slot's own action.
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleVersion(versions);
                }
              }}
              style={{
                ...styles.versionToggle,
                backgroundColor: activeVersion === 'hero' ? '#f5a623' : '#a03cf0',
              }}
              title={`Showing ${activeVersion === 'hero' ? 'Hero' : 'Evolution'}. Click to switch. The Clash Royale API can't tell Evolution-only from Hero ownership apart, so both are offered; pick the one you actually own.`}
            >
              ⇄ {activeVersion === 'hero' ? 'Hero' : 'Evo'}
            </span>
          )}
        </CardTile>
      ) : (
        <>
          <div
            style={{
              ...styles.empty,
              // Default near-black border suits dark mode; soften it in light.
              ...(isDarkMode ? {} : { border: `2px solid ${theme.border}` }),
              // Fill the interior with the deck surface so an empty special
              // slot blends in. Must be a gradient (image), not a bare colour:
              // a colour in this layer lets the border gradient bleed through.
              ...(kind
                ? slotBorderStyle(
                    kind,
                    isDarkMode,
                    `linear-gradient(${theme.bg.secondary}, ${theme.bg.secondary})`,
                    false
                  )
                : {}),
              ...dropOutline,
            }}
          >
            <span style={{ ...styles.plus, color: theme.text.secondary }}>+</span>
          </div>
          {/* Non-breaking space keeps the name row's height so filling a slot
              never shifts the grid. */}
          <div style={{ ...styles.emptyName, color: theme.text.primary }}> </div>
        </>
      )}
    </button>
  );
}

const styles = {
  slot: {
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    display: 'block',
    width: '100%',
    userSelect: 'none' as const,
  },
  dropTarget: {
    outline: '3px solid #4dabf7',
    outlineOffset: '2px',
  },
  dropTargetInvalid: {
    outline: '3px solid #ff6b6b',
    outlineOffset: '2px',
  },
  // Small pill, top-right of a "both" slot, to flip between owned evo/hero art.
  versionToggle: {
    position: 'absolute' as const,
    top: '3px',
    right: '3px',
    zIndex: 2,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '2px',
    padding: '2px 5px',
    borderRadius: '999px',
    color: '#ffffff',
    fontSize: '9px',
    fontWeight: 800 as const,
    letterSpacing: '0.3px',
    cursor: 'pointer',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
    userSelect: 'none' as const,
  },
  empty: {
    aspectRatio: '0.82',
    border: '2px solid rgba(0, 0, 0, 0.4)',
    borderRadius: '10px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  emptyName: {
    fontSize: '10px',
    fontWeight: 600 as const,
    textAlign: 'center' as const,
    marginTop: '5px',
    lineHeight: 1.1,
    minHeight: '12px',
  },
  plus: {
    fontSize: '28px',
    fontWeight: 300 as const,
  },
};
