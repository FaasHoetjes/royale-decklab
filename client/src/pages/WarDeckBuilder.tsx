import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useAllCards, usePlayerCollection, useDeckScores } from '../queries';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useIsMobile } from '../hooks/useIsMobile';
import { useDeckBoard } from '../hooks/useDeckBoard';
import Tweened from '../components/Tweened';
import { toBuilderCards, type BuilderCard } from '../lib/builderCards';
import { builderDeckNames, championFits, nextSlot, placeInDeck } from '../lib/builderDecks';
import { flyCard, replayAnimation } from '../lib/flyCard';
import { FOLD_EASING, prefersReducedMotion } from '../lib/motion';
import type { ScoreDeckCard } from '../api';
import { loadPickerPrefs, savePickerPrefs, type FilterKey } from '../lib/pickerData';
import BuilderDeckTabs from '../components/BuilderDeckTabs';
import BuilderDeckStrip from '../components/BuilderDeckStrip';
import BuilderStage from '../components/BuilderStage';
import CardCollection from '../components/CardCollection';
import TrashIcon from '../components/TrashIcon';
import { BuilderSkeleton } from '../components/LoadingSkeletons';
import LoadError from '../components/LoadError';

/** The app header's height on phones, which the deck tabs pin under. */
const MOBILE_HEADER = 62;

export default function WarDeckBuilder() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();

  const cardsQuery = useAllCards();
  const catalog = cardsQuery.data ?? [];
  const collectionQuery = usePlayerCollection(activePlayerTag);
  const owned = collectionQuery.data ?? [];

  const loading = cardsQuery.isLoading || collectionQuery.isLoading;
  const loadFailed = cardsQuery.isError || collectionQuery.isError;
  const retryLoad = () => {
    if (cardsQuery.isError) cardsQuery.refetch();
    if (collectionQuery.isError) collectionQuery.refetch();
  };

  const builderCards = useMemo<BuilderCard[]>(() => toBuilderCards(catalog, owned), [catalog, owned]);

  const cardById = useMemo(
    () => new Map(builderCards.map((c) => [c.id, c])),
    [builderCards]
  );

  const board = useDeckBoard(cardById);

  // Start on the first deck that still has room, so a half-built lineup picks up where it left off.
  const [active, setActive] = useState(() => Math.max(0, board.decks.findIndex((d) => d.includes(null))));
  // The empty slot the player clicked; without one, cards fill the deck in order.
  const [chosenSlot, setChosenSlot] = useState<number | null>(null);
  const activeDeck = board.decks[active] ?? [];
  const targetSlot = nextSlot(activeDeck, chosenSlot);

  // A complete deck has nowhere to put a card, so the collection folds away unless the player opens it.
  const deckFull = !activeDeck.includes(null);
  const [browsing, setBrowsing] = useState(false);
  const wantCards = !deckFull || browsing;
  const [cardsOpen, setCardsOpen] = useState(wantCards);
  const filledLast = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (wantCards || !filledLast.current) {
      setCardsOpen(wantCards);
      return;
    }
    // Let the last card land before the collection folds, then bring the finished deck into view.
    filledLast.current = false;
    const timer = window.setTimeout(() => {
      setCardsOpen(false);
      const stage = stageRef.current;
      if (!stage) return;
      const offset = isMobile ? MOBILE_HEADER + (pinRef.current?.offsetHeight ?? 0) + 12 : 24;
      const top = stage.getBoundingClientRect().top;
      if (top >= offset) return;
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // On desktop the header, tabs and deck fit on screen together, so go all the way up.
      window.scrollTo({ top: isMobile ? window.scrollY + top - offset : 0, behavior: smooth ? 'smooth' : 'auto' });
    }, 430);
    return () => window.clearTimeout(timer);
  }, [wantCards, isMobile]);

  // On a phone the deck and your cards don't fit on one screen, so once the deck scrolls away a small copy of it
  // takes the tabs' place.
  const ready = !loading && !loadFailed;
  const [stripShown, setStripShown] = useState(false);
  useEffect(() => {
    const slots = slotsRef.current;
    const pin = pinRef.current;
    if (!isMobile || !ready || !slots || !pin) {
      setStripShown(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setStripShown(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0));
      },
      { rootMargin: `-${MOBILE_HEADER + pin.offsetHeight}px 0px 0px 0px` }
    );
    observer.observe(slots);
    return () => observer.disconnect();
  }, [isMobile, ready]);

  // Tapping a slot in the big deck on a phone takes you down to your cards, once they're open.
  const cardsPending = useRef(false);
  const [cardsRequest, setCardsRequest] = useState(0);
  useEffect(() => {
    if (!cardsPending.current || !cardsOpen) return;
    cardsPending.current = false;
    const stage = stageRef.current;
    const pin = pinRef.current;
    if (!stage || !pin) return;
    const top = window.scrollY + stage.getBoundingClientRect().bottom - MOBILE_HEADER - pin.offsetHeight;
    if (top > window.scrollY) window.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [cardsRequest, cardsOpen]);

  const [initialPrefs] = useState(loadPickerPrefs);
  const [filters, setFilters] = useState<Set<FilterKey>>(() => new Set(initialPrefs.filters));
  const [sortIndex, setSortIndex] = useState(initialPrefs.sortIndex);
  const [descending, setDescending] = useState(initialPrefs.descending);
  useEffect(() => {
    savePickerPrefs({ filters: [...filters], sortIndex, descending });
  }, [filters, sortIndex, descending]);

  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  };
  useEffect(() => () => {
    if (noticeTimer.current != null) window.clearTimeout(noticeTimer.current);
  }, []);

  // The whole collection, not just placed cards: scoring compares decks against the player's own level.
  const scoreCards = useMemo<ScoreDeckCard[]>(() => {
    return builderCards
      .filter((c) => c.owned && c.level != null)
      .map((c) => ({
        id: c.id,
        level: c.level as number,
        maxLevel: c.maxLevel ?? 16,
        evolutionLevel: (c.hasEvo ? 1 : 0) | (c.ownsHero ? 2 : 0),
        rarity: c.rarity,
      }));
  }, [builderCards]);

  const scoreInput = useMemo(() => ({ cards: scoreCards, decks: board.decks }), [scoreCards, board.decks]);
  // On a phone every change is a separate tap, so there's no burst of edits worth waiting out.
  const debouncedInput = useDebouncedValue(scoreInput, isMobile ? 0 : 300);
  const scoreQuery = useDeckScores(
    debouncedInput.cards,
    debouncedInput.decks,
    debouncedInput.cards.length > 0 && debouncedInput.decks.some((deck) => deck.some((id) => id != null))
  );

  const scores = board.usedIds.size > 0 ? scoreQuery.data ?? null : null;
  const names = useMemo(() => builderDeckNames(board.decks, cardById), [board.decks, cardById]);

  const usedIn = useMemo(() => {
    const map = new Map<number, number>();
    board.decks.forEach((deck, i) => deck.forEach((id) => id != null && map.set(id, i)));
    return map;
  }, [board.decks]);

  // A lineup score change floats off the total; a deck that just matched a meta deck lights up.
  const [gain, setGain] = useState<{ delta: number; key: number } | null>(null);
  const lastScores = useRef(scores);
  useEffect(() => {
    const prev = lastScores.current;
    lastScores.current = scores;
    if (!prev || !scores || prev === scores) return;
    const delta = scores.total - prev.total;
    if (Math.abs(delta) >= 0.01) setGain((g) => ({ delta, key: (g?.key ?? 0) + 1 }));
    scores.decks.forEach((s, i) => {
      if (s.isMeta && !prev.decks[i]?.isMeta) {
        replayAnimation(document.querySelector(`[data-deck-tab="${i}"]`), 'wdb-matched');
      }
    });
  }, [scores]);

  const flights = useRef<{ deckIndex: number; slotIndex: number; from: DOMRect }[]>([]);
  useLayoutEffect(() => {
    flights.current.forEach((f) => {
      const art = slotArt(f.deckIndex, f.slotIndex, stripShown);
      if (art) flyCard(f.from, art);
    });
    flights.current = [];
  }, [board.decks]);

  const pickCard = (cardId: number, from: DOMRect) => {
    const card = cardById.get(cardId);
    const placement = placeInDeck(activeDeck, card, chosenSlot, cardById);
    if (!placement) {
      showNotice(
        card?.rarity === 'champion' && activeDeck.includes(null)
          ? 'This deck already has two champions'
          : 'This deck is full. Click a card in it to remove it.'
      );
      return;
    }
    const { slot, bump } = placement;
    const bumpedFrom = bump && slotArt(active, bump.from, stripShown)?.getBoundingClientRect();
    if (bump) board.swapSlots({ deckIndex: active, slotIndex: bump.from }, { deckIndex: active, slotIndex: bump.to });
    board.setSlot(active, slot, cardId);
    setChosenSlot(null);
    setBrowsing(false);
    filledLast.current = activeDeck.filter((id) => id == null).length === 1;
    flights.current = [{ deckIndex: active, slotIndex: slot, from }];
    if (bump && bumpedFrom) flights.current.push({ deckIndex: active, slotIndex: bump.to, from: bumpedFrom });
  };

  /** Whether the tap chose the slot, rather than ending a drag. */
  const handleSlotClick = (slotIndex: number) => {
    if (board.consumeDragClick()) return false;
    if (activeDeck[slotIndex] != null) board.setSlot(active, slotIndex, null);
    setChosenSlot(slotIndex);
    return true;
  };

  const handleStageSlotClick = (slotIndex: number) => {
    if (!handleSlotClick(slotIndex) || !isMobile) return;
    cardsPending.current = true;
    setCardsRequest((n) => n + 1);
  };

  const selectDeck = (deckIndex: number) => {
    setActive(deckIndex);
    setChosenSlot(null);
    setBrowsing(false);
  };

  const tabs = (
    <BuilderDeckTabs
      decks={board.decks}
      names={names}
      scores={scores?.decks ?? null}
      active={active}
      onSelect={selectDeck}
      cardById={cardById}
      theme={theme}
      isMobile={isMobile}
    />
  );

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div style={{ ...styles.header, marginBottom: isMobile ? '14px' : '22px' }}>
        <div style={{ minWidth: 0 }}>
          {!isMobile && <h2 style={{ color: theme.text.primary, margin: 0 }}>War Deck Builder</h2>}
          <p style={{ ...styles.subtitle, marginTop: isMobile ? 0 : '6px', color: theme.text.secondary }}>
            Build four war decks that don't share a card.
          </p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.total}>
            {gain && (
              <span key={gain.key} className="ua-float" style={{ ...styles.float, color: theme.text.primary }} aria-hidden="true">
                {gain.delta > 0 ? '+' : '−'}
                {Math.abs(gain.delta).toFixed(3)}
              </span>
            )}
            <div style={{ ...styles.totalValue, fontSize: isMobile ? '26px' : '34px', color: theme.text.primary }}>
              <Tweened value={scores?.total ?? 0} />
            </div>
            <div style={{ ...styles.totalLabel, color: theme.text.tertiary }}>lineup score</div>
          </div>
          {board.usedIds.size > 0 && (
            <button
              type="button"
              className="mobile-touch-target"
              onClick={() => {
                board.resetAll();
                setChosenSlot(null);
              }}
              aria-label="Clear all four decks"
              title="Clear all four decks"
              style={{
                ...styles.resetAll,
                ...(isMobile && { width: '36px', padding: 0, justifyContent: 'center' as const }),
                color: theme.text.primary,
                borderColor: theme.borderStrong,
              }}
            >
              <TrashIcon size={isMobile ? 24 : 13} />
              {!isMobile && 'Clear all'}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <BuilderSkeleton isMobile={isMobile} />
      ) : loadFailed ? (
        <LoadError
          title="Can't reach the server"
          message="Royale DeckLab is unreachable right now. Please try again in a moment."
          onRetry={retryLoad}
          retrying={cardsQuery.isFetching || collectionQuery.isFetching}
          retryLabel="Retry connection"
        />
      ) : (
        <>
          {isMobile ? (
            <div ref={pinRef} style={{ ...styles.pin, backgroundColor: theme.bg.primary }}>
              <div style={pinLayer(!stripShown)}>{tabs}</div>
              <div style={pinLayer(stripShown)}>
                <BuilderDeckStrip
                  deckIndex={active}
                  name={names[active] ?? `Deck ${active + 1}`}
                  board={board}
                  cardById={cardById}
                  target={targetSlot}
                  onSlotClick={handleSlotClick}
                  onSelectDeck={selectDeck}
                  theme={theme}
                />
              </div>
            </div>
          ) : (
            tabs
          )}
          <BuilderStage
            ref={stageRef}
            slotsRef={slotsRef}
            deckIndex={active}
            name={names[active] ?? `Deck ${active + 1}`}
            score={scores?.decks[active]}
            board={board}
            cardById={cardById}
            target={targetSlot}
            onSlotClick={handleStageSlotClick}
            theme={theme}
            isMobile={isMobile}
          />
          {activePlayerTag ? (
            <CardCollection
              cards={builderCards}
              usedIn={usedIn}
              championFits={championFits(activeDeck, cardById)}
              onPick={pickCard}
              filters={filters}
              setFilters={setFilters}
              sortIndex={sortIndex}
              setSortIndex={setSortIndex}
              descending={descending}
              setDescending={setDescending}
              notice={notice}
              deckFull={deckFull}
              open={cardsOpen}
              onToggle={() => setBrowsing(!cardsOpen)}
              theme={theme}
              isMobile={isMobile}
            />
          ) : (
            <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                The builder uses your card collection. Search your player tag first.
              </p>
              <Link to="/" style={{ ...styles.panelButton, backgroundColor: theme.text.primary, color: theme.bg.primary }}>
                Search your player tag
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** The card art inside a deck slot, to fly cards to and from: in the pinned strip while that's what's in view. */
function slotArt(deckIndex: number, slotIndex: number, inStrip: boolean): HTMLElement | null {
  const selector = inStrip ? `[data-strip-slot="${slotIndex}"]` : `[data-deck-index="${deckIndex}"][data-slot-index="${slotIndex}"]`;
  const art = document.querySelector(selector)?.firstElementChild;
  return art instanceof HTMLElement ? art : null;
}

function pinLayer(shown: boolean) {
  return {
    gridArea: '1 / 1',
    opacity: shown ? 1 : 0,
    visibility: shown ? ('visible' as const) : ('hidden' as const),
    transition: prefersReducedMotion() ? 'none' : `opacity 180ms ${FOLD_EASING}, visibility 180ms`,
  };
}

const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  pin: {
    position: 'sticky' as const,
    top: `${MOBILE_HEADER}px`,
    zIndex: 5,
    display: 'grid' as const,
    alignItems: 'end' as const,
    padding: '4px 0 8px',
  },
  header: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-end' as const,
    gap: '16px',
  },
  subtitle: {
    fontSize: '15px',
    lineHeight: 1.5,
    margin: 0,
  },
  headerRight: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
    flexShrink: 0,
  },
  total: {
    position: 'relative' as const,
    textAlign: 'right' as const,
  },
  totalValue: {
    fontWeight: 700 as const,
    lineHeight: 1,
    letterSpacing: '-0.5px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  totalLabel: {
    fontSize: '12.5px',
    marginTop: '5px',
    whiteSpace: 'nowrap' as const,
  },
  float: {
    position: 'absolute' as const,
    right: 0,
    top: '-22px',
    fontSize: '18px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    pointerEvents: 'none' as const,
    opacity: 0,
  },
  resetAll: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    boxSizing: 'border-box' as const,
    height: '36px',
    padding: '0 14px',
    border: '1px solid',
    borderRadius: '10px',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer' as const,
  },
  panel: {
    border: '1px solid',
    borderRadius: '12px',
    padding: '28px 24px',
    textAlign: 'center' as const,
  },
  panelText: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 4px',
  },
  panelButton: {
    display: 'inline-block' as const,
    marginTop: '14px',
    padding: '10px 22px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 600 as const,
  },
};
