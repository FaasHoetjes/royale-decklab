import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { fetchAllCards } from '../api';
import CardTile from '../components/CardTile';
import { generatePool } from '../draft/pool';
import { snakeOrder } from '../draft/snake';
import { computerPick, autoPickForPlayer } from '../draft/ai';
import { pickPoints, finalScore } from '../draft/scoring';
import type { CardTag, Difficulty, PoolCard, Side } from '../draft/types';

const TOTAL_PICKS = 16;
const PICK_SECONDS = 15;
const THINK_MS = 800;

type Phase = 'setup' | 'drafting' | 'results';

interface Art {
  name: string;
  elixir?: number;
  iconUrl?: string;
}

const DIFFICULTIES: { key: Difficulty; label: string; blurb: string }[] = [
  { key: 'easy', label: 'Easy', blurb: 'The computer often leaves good counters on the board.' },
  { key: 'medium', label: 'Medium', blurb: 'The computer drafts solid counters to your deck.' },
  { key: 'hard', label: 'Hard', blurb: 'The computer also drafts away your best answers.' },
];

const GRADE_COLOR: Record<string, string> = {
  S: '#ffb300', A: '#22c55e', B: '#3b82f6', C: '#f59e0b', D: '#ef4444',
};

export default function MegaDraft() {
  const { isDarkMode } = useApp();
  const theme = getTheme(isDarkMode);

  const [phase, setPhase] = useState<Phase>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [artMap, setArtMap] = useState<Map<number, Art>>(new Map());
  const [artError, setArtError] = useState(false);

  const [pool, setPool] = useState<PoolCard[]>([]);
  const [order, setOrder] = useState<Side[]>([]);
  const [pickIndex, setPickIndex] = useState(0);
  const [playerDeck, setPlayerDeck] = useState<CardTag[]>([]);
  const [computerDeck, setComputerDeck] = useState<CardTag[]>([]);
  const [playerPoints, setPlayerPoints] = useState(0);
  const [lastPick, setLastPick] = useState<{ side: Side; name: string; pts: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(PICK_SECONDS);
  const [thinking, setThinking] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [autoToast, setAutoToast] = useState<string | null>(null);

  // Fetch the card catalog once for art. The draft is fully playable without it
  // (CardTile falls back to the name), so a failure is non-fatal.
  useEffect(() => {
    let alive = true;
    fetchAllCards()
      .then(({ cards }) => {
        if (!alive) return;
        const m = new Map<number, Art>();
        for (const c of cards) {
          m.set(c.id, { name: c.name, elixir: c.elixirCost, iconUrl: c.iconUrls?.medium });
        }
        setArtMap(m);
      })
      .catch(() => alive && setArtError(true));
    return () => { alive = false; };
  }, []);

  const currentSide: Side | null = phase === 'drafting' && pickIndex < TOTAL_PICKS ? (order[pickIndex] ?? null) : null;
  const isPlayerTurn = currentSide === 'player';
  const available = useMemo(() => pool.filter(pc => pc.taken === null), [pool]);

  // commitPick reads the decks from the current closure. It is only ever called
  // from a fresh context — the player's click handler (latest render) or a
  // timer created in the turn effect (which re-runs each pick) — so the boards
  // it sees are always up to date.
  const commitPick = (side: Side, card: CardTag, auto = false) => {
    const opponentBoard = side === 'player' ? computerDeck : playerDeck;
    const ownDeck = side === 'player' ? playerDeck : computerDeck;
    const pts = pickPoints(card, opponentBoard, ownDeck);

    setPool(prev => prev.map(pc => (pc.card.id === card.id ? { ...pc, taken: side, pickedAt: pickIndex + 1 } : pc)));
    if (side === 'player') {
      setPlayerDeck(d => [...d, card]);
      setPlayerPoints(p => p + pts);
      if (auto) setAutoToast(`Time! Auto-picked ${card.name}`);
    } else {
      setComputerDeck(d => [...d, card]);
    }
    setLastPick({ side, name: card.name, pts });
    setPickIndex(i => i + 1);
  };

  // Turn driver: one effect per pick. Computer turns resolve after a short
  // "thinking" delay; player turns run a countdown that auto-picks on timeout.
  useEffect(() => {
    if (phase !== 'drafting') return;
    if (pickIndex >= TOTAL_PICKS) { setPhase('results'); return; }

    const side = order[pickIndex];
    const avail = pool.filter(pc => pc.taken === null).map(pc => pc.card);

    if (side === 'computer') {
      setThinking(true);
      const t = setTimeout(() => {
        setThinking(false);
        commitPick('computer', computerPick(avail, computerDeck, playerDeck, difficulty));
      }, THINK_MS);
      return () => clearTimeout(t);
    }

    setThinking(false);
    setSecondsLeft(PICK_SECONDS);
    const iv = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          clearInterval(iv);
          commitPick('player', autoPickForPlayer(avail, playerDeck, computerDeck), true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pickIndex]);

  // Clear the timeout toast shortly after it appears.
  useEffect(() => {
    if (!autoToast) return;
    const t = setTimeout(() => setAutoToast(null), 2200);
    return () => clearTimeout(t);
  }, [autoToast]);

  const startDraft = () => {
    const generated = generatePool();
    setPool(generated.map(card => ({ card, taken: null })));
    setOrder(snakeOrder('player'));
    setPickIndex(0);
    setPlayerDeck([]);
    setComputerDeck([]);
    setPlayerPoints(0);
    setLastPick(null);
    setAutoToast(null);
    setHoveredId(null);
    setPhase('drafting');
  };

  const onPickCard = (card: CardTag) => {
    if (!isPlayerTurn || thinking) return;
    commitPick('player', card);
  };

  const art = (card: CardTag): Art =>
    artMap.get(card.id) ?? { name: card.name, elixir: card.elixir };

  // ---- Setup screen ----
  if (phase === 'setup') {
    return (
      <div style={styles.page}>
        <Header theme={theme} />
        <div style={{ ...styles.setupCard, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>Mega Draft vs Computer</h2>
          <p style={{ color: theme.text.secondary, lineHeight: 1.5, marginTop: 8 }}>
            You and the computer snake-draft an 8-card deck from a shared 36-card pool. Pick
            the best answers to the computer's board — each pick scores points, and at the end
            you get a performance grade for how well you drafted.
          </p>

          <div style={styles.difficultyRow}>
            {DIFFICULTIES.map(d => {
              const active = difficulty === d.key;
              return (
                <button
                  key={d.key}
                  onClick={() => setDifficulty(d.key)}
                  style={{
                    ...styles.difficultyButton,
                    borderColor: active ? theme.accent : theme.border,
                    backgroundColor: active ? theme.accent : theme.bg.tertiary,
                    color: active ? theme.onAccent : theme.text.primary,
                  }}
                >
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{d.label}</span>
                  <span style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>{d.blurb}</span>
                </button>
              );
            })}
          </div>

          <button onClick={startDraft} style={{ ...styles.primaryButton, backgroundColor: theme.accent, color: theme.onAccent }}>
            Start Draft
          </button>
          {artError && (
            <p style={{ color: theme.text.secondary, fontSize: 12, marginTop: 10 }}>
              (Card art couldn't be loaded — the draft still works, cards show their names.)
            </p>
          )}
        </div>
        <Disclaimer theme={theme} />
      </div>
    );
  }

  // ---- Results screen ----
  if (phase === 'results') {
    const score = finalScore(playerDeck, computerDeck);
    return (
      <div style={styles.page}>
        <Header theme={theme} />
        <div style={{ ...styles.setupCard, backgroundColor: theme.bg.secondary, borderColor: theme.border, textAlign: 'center' }}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>Draft complete</h2>
          <div style={{ ...styles.gradeBadge, color: GRADE_COLOR[score.grade], borderColor: GRADE_COLOR[score.grade], animation: 'mega-pop 0.4s ease' }}>
            {score.grade}
          </div>
          <div style={{ color: theme.text.primary, fontSize: 38, fontWeight: 800 }}>{score.total}<span style={{ fontSize: 18, color: theme.text.secondary }}> / 100</span></div>
          <div style={{ color: theme.text.secondary, fontSize: 13, marginBottom: 8 }}>{playerPoints} draft points earned</div>

          <div style={styles.breakdown}>
            <Bar label="Counter coverage" value={score.counterCoverage} theme={theme} />
            <Bar label="Deck completeness" value={score.completeness} theme={theme} />
            <Bar label={`Elixir balance (avg ${score.avgElixir})`} value={score.elixirBalance} theme={theme} />
          </div>

          <DeckRow title="Your deck" cards={playerDeck} art={art} theme={theme} accent={theme.accent} />
          <DeckRow title="Computer deck" cards={computerDeck} art={art} theme={theme} accent="#ef4444" />

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 18 }}>
            <button onClick={startDraft} style={{ ...styles.primaryButton, backgroundColor: theme.accent, color: theme.onAccent, width: 'auto', padding: '12px 24px' }}>
              Draft again
            </button>
            <button onClick={() => setPhase('setup')} style={{ ...styles.secondaryButton, color: theme.text.primary, borderColor: theme.border }}>
              Change difficulty
            </button>
          </div>
        </div>
        <Disclaimer theme={theme} />
      </div>
    );
  }

  // ---- Drafting screen ----
  return (
    <div style={styles.page}>
      <Header theme={theme} />

      {/* Top status bar */}
      <div style={{ ...styles.topBar, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
        <div style={{ ...styles.turnPill, backgroundColor: isPlayerTurn ? theme.accent : theme.bg.tertiary, color: isPlayerTurn ? theme.onAccent : theme.text.secondary }}>
          {isPlayerTurn ? 'Your pick' : 'Computer is thinking…'}
        </div>
        <div style={{ color: theme.text.secondary, fontWeight: 700 }}>Pick {Math.min(pickIndex + 1, TOTAL_PICKS)} / {TOTAL_PICKS}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: theme.text.secondary, fontSize: 13 }}>Difficulty</span>
          <span style={{ ...styles.diffBadge, borderColor: theme.accent, color: theme.accent }}>{difficulty}</span>
          <TimerRing seconds={isPlayerTurn ? secondsLeft : 0} total={PICK_SECONDS} active={isPlayerTurn} accent={theme.accent} dim={theme.border} text={theme.text.primary} />
        </div>
      </div>

      <div style={styles.draftLayout}>
        <Tray title="Your deck" cards={playerDeck} art={art} theme={theme} accent={theme.accent} points={playerPoints} side="player" lastPick={lastPick} />

        <div style={styles.gridWrap}>
          {autoToast && <div style={styles.toast}>{autoToast}</div>}
          <div style={styles.grid}>
            {pool.map(pc => {
              const a = art(pc.card);
              const selectable = isPlayerTurn && pc.taken === null && !thinking;
              const preview =
                selectable && hoveredId === pc.card.id
                  ? pickPoints(pc.card, computerDeck, playerDeck)
                  : null;
              return (
                <CardTile
                  key={pc.card.id}
                  name={a.name}
                  elixir={a.elixir}
                  iconUrl={a.iconUrl}
                  dimmed={pc.taken !== null}
                  badge={pc.taken === 'player' ? 'P' : pc.taken === 'computer' ? 'C' : undefined}
                  badgeColor={pc.taken === 'player' ? theme.accent : '#ef4444'}
                  selectable={selectable}
                  pointsPreview={preview}
                  highlight={lastPick != null && pc.card.name === lastPick.name && pc.taken !== null}
                  onClick={() => onPickCard(pc.card)}
                  onHoverChange={h => setHoveredId(h ? pc.card.id : null)}
                />
              );
            })}
          </div>
        </div>

        <Tray title="Computer deck" cards={computerDeck} art={art} theme={theme} accent="#ef4444" side="computer" lastPick={lastPick} />
      </div>
      <Disclaimer theme={theme} />
    </div>
  );
}

// ---------- small presentational helpers ----------

function Header({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h1 style={{ color: theme.text.primary, margin: 0, fontSize: 24 }}>Mega Draft</h1>
    </div>
  );
}

function Disclaimer({ theme }: { theme: ReturnType<typeof getTheme> }) {
  return (
    <p style={{ color: theme.text.secondary, fontSize: 11, marginTop: 24, textAlign: 'center', opacity: 0.8 }}>
      Unofficial fan content — not affiliated with or endorsed by Supercell. Clash Royale is a trademark of Supercell.
    </p>
  );
}

function Bar({ label, value, theme }: { label: string; value: number; theme: ReturnType<typeof getTheme> }) {
  return (
    <div style={{ marginBottom: 10, textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: theme.text.secondary, marginBottom: 3 }}>
        <span>{label}</span><span>{value}</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, backgroundColor: theme.bg.tertiary, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, backgroundColor: theme.accent, borderRadius: 999, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  );
}

function Tray({
  title, cards, art, theme, accent, points, side, lastPick,
}: {
  title: string;
  cards: CardTag[];
  art: (c: CardTag) => Art;
  theme: ReturnType<typeof getTheme>;
  accent: string;
  points?: number;
  side: Side;
  lastPick: { side: Side; name: string; pts: number } | null;
}) {
  const slots = Array.from({ length: 8 }, (_, i) => cards[i] ?? null);
  return (
    <div style={{ ...styles.tray, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: theme.text.primary, fontWeight: 800, fontSize: 14 }}>{title}</span>
        {points != null && <span style={{ color: accent, fontWeight: 800 }}>{points} pts</span>}
      </div>
      {lastPick?.side === side && (
        <div style={{ color: '#22c55e', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          {lastPick.name} +{lastPick.pts}
        </div>
      )}
      <div style={styles.trayGrid}>
        {slots.map((c, i) =>
          c ? (
            <CardTile key={c.id} name={art(c).name} elixir={art(c).elixir} iconUrl={art(c).iconUrl} />
          ) : (
            <div key={`empty-${i}`} style={{ ...styles.emptySlot, borderColor: theme.border }} />
          ),
        )}
      </div>
    </div>
  );
}

function DeckRow({
  title, cards, art, theme, accent,
}: {
  title: string;
  cards: CardTag[];
  art: (c: CardTag) => Art;
  theme: ReturnType<typeof getTheme>;
  accent: string;
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ color: accent, fontWeight: 800, fontSize: 13, textAlign: 'left', marginBottom: 6 }}>{title}</div>
      <div style={styles.resultsDeck}>
        {cards.map(c => (
          <CardTile key={c.id} name={art(c).name} elixir={art(c).elixir} iconUrl={art(c).iconUrl} />
        ))}
      </div>
    </div>
  );
}

function TimerRing({
  seconds, total, active, accent, dim, text,
}: {
  seconds: number; total: number; active: boolean; accent: string; dim: string; text: string;
}) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = active ? seconds / total : 0;
  const low = active && seconds <= 5;
  return (
    <div style={{ position: 'relative', width: 40, height: 40 }}>
      <svg width="40" height="40" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke={dim} strokeWidth="4" />
        <circle
          cx="20" cy="20" r={r} fill="none"
          stroke={low ? '#ef4444' : accent}
          strokeWidth="4" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: active ? text : dim }}>
        {active ? seconds : '–'}
      </span>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px',
  },
  setupCard: {
    border: '1px solid',
    borderRadius: 14,
    padding: 28,
    maxWidth: 720,
    margin: '0 auto',
  },
  difficultyRow: {
    display: 'flex' as const,
    gap: 12,
    margin: '22px 0',
    flexWrap: 'wrap' as const,
  },
  difficultyButton: {
    flex: '1 1 160px',
    border: '2px solid',
    borderRadius: 12,
    padding: '14px 16px',
    cursor: 'pointer',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    textAlign: 'left' as const,
  },
  primaryButton: {
    width: '100%',
    border: 'none',
    borderRadius: 10,
    color: '#fff',
    fontWeight: 800,
    fontSize: 16,
    padding: '14px',
    cursor: 'pointer',
  },
  secondaryButton: {
    border: '2px solid',
    background: 'transparent',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 15,
    padding: '12px 24px',
    cursor: 'pointer',
  },
  topBar: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    border: '1px solid',
    borderRadius: 12,
    padding: '10px 16px',
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  turnPill: {
    fontWeight: 800,
    fontSize: 14,
    padding: '6px 14px',
    borderRadius: 999,
  },
  diffBadge: {
    border: '1.5px solid',
    borderRadius: 999,
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 800,
    textTransform: 'capitalize' as const,
  },
  draftLayout: {
    display: 'grid' as const,
    gridTemplateColumns: 'minmax(180px, 220px) 1fr minmax(180px, 220px)',
    gap: 16,
    alignItems: 'start' as const,
  },
  gridWrap: {
    position: 'relative' as const,
  },
  grid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: 10,
  },
  tray: {
    border: '1px solid',
    borderRadius: 12,
    padding: 14,
    position: 'sticky' as const,
    top: 16,
  },
  trayGrid: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  emptySlot: {
    aspectRatio: '0.82',
    borderRadius: 10,
    border: '2px dashed',
    opacity: 0.5,
  },
  resultsDeck: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(8, 1fr)',
    gap: 8,
  },
  breakdown: {
    maxWidth: 420,
    margin: '14px auto 4px',
  },
  gradeBadge: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '4px solid',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    fontSize: 40,
    fontWeight: 900,
    margin: '14px auto 6px',
  },
  toast: {
    position: 'absolute' as const,
    top: -6,
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(0,0,0,0.82)',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    padding: '6px 14px',
    borderRadius: 999,
    zIndex: 5,
  },
};
