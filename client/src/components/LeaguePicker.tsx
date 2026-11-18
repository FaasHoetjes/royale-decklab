import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { LEAGUES, type CrownSeriesLeague } from '../lib/crownSeries';
import type { CrownSeriesLeagueId } from '../api';

interface LeaguePickerProps {
  league: CrownSeriesLeague;
  onPick: (league: CrownSeriesLeagueId) => void;
}

/** A dropdown of the Crown Series leagues, each with its shield and level cap. */
export default function LeaguePicker({ league, onPick }: LeaguePickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const optionId = (i: number) => `${listId}-${i}`;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const pick = (i: number) => {
    const next = LEAGUES[i];
    if (next && next.id !== league.id) onPick(next.id);
    close(true);
  };
  const openAt = (i: number) => {
    setActive(i);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onPointer = (e: PointerEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (!root.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  // Scrolls only the list, never the page, to keep the active league in view.
  useEffect(() => {
    const box = list.current;
    const option = box?.children[active];
    if (!box || !(option instanceof HTMLElement)) return;
    if (option.offsetTop < box.scrollTop) box.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = option.offsetTop + option.offsetHeight - box.clientHeight;
    }
  }, [open, active]);

  const selected = LEAGUES.findIndex((l) => l.id === league.id);

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openAt(selected);
    }
  };
  const onListKey = (e: KeyboardEvent) => {
    const last = LEAGUES.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setActive(moves[e.key] ?? active);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={root} style={styles.root}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`League: ${league.name} League, cards up to level ${league.levelCap}`}
        onClick={() => (open ? close(false) : openAt(selected))}
        onKeyDown={onButtonKey}
        style={{
          ...styles.button,
          borderColor: `color-mix(in srgb, ${league.color} 55%, var(--border-strong))`,
          background: `linear-gradient(90deg, color-mix(in srgb, ${league.color} 22%, var(--control-bg)), var(--control-bg) 70%)`,
        }}
      >
        <img src={league.shield} alt="" style={{ ...styles.buttonShield, filter: `drop-shadow(0 0 8px ${league.glow})` }} />
        <span style={styles.text}>
          <span style={styles.name}>{league.name} League</span>
          <span style={styles.cap}>Cards up to level {league.levelCap}</span>
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true" style={{ ...styles.chevron, transform: open ? 'rotate(180deg)' : undefined }}>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label="League"
          aria-activedescendant={optionId(active)}
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!root.current?.contains(e.relatedTarget)) setOpen(false);
          }}
          className="gc-menu"
          style={styles.list}
        >
          {LEAGUES.map((l, i) => (
            <li
              key={l.id}
              id={optionId(i)}
              role="option"
              aria-selected={i === selected}
              onClick={() => pick(i)}
              onPointerMove={() => setActive(i)}
              style={{
                ...styles.option,
                backgroundColor: i === active
                  ? 'var(--nav-active-bg)'
                  : i === selected
                    ? `color-mix(in srgb, ${l.color} 16%, transparent)`
                    : undefined,
              }}
            >
              <img src={l.shield} alt="" style={styles.optionShield} />
              <span style={styles.optionName}>{l.name} League</span>
              <span style={styles.optionCap}>Level {l.levelCap}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const styles = {
  root: {
    position: 'relative' as const,
    minWidth: 0,
  },
  button: {
    width: '100%',
    height: '56px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '12px',
    padding: '0 14px 0 10px',
    borderRadius: '14px',
    border: '1px solid',
    color: 'var(--control-text)',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  buttonShield: {
    height: '42px',
    flexShrink: 0,
  },
  text: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minWidth: 0,
  },
  name: {
    fontSize: '15px',
    fontWeight: 700 as const,
  },
  cap: {
    fontSize: '12.5px',
    color: 'var(--text-secondary)',
  },
  chevron: {
    width: '18px',
    height: '18px',
    marginLeft: 'auto',
    flexShrink: 0,
    color: 'var(--text-secondary)',
    transition: 'transform 0.2s ease',
  },
  list: {
    position: 'absolute' as const,
    zIndex: 50,
    top: 'calc(100% + 6px)',
    left: 0,
    right: 0,
    maxHeight: 'min(420px, 60vh)',
    overflowY: 'auto' as const,
    overscrollBehavior: 'contain' as const,
    scrollbarWidth: 'thin' as const,
    scrollbarColor: 'color-mix(in srgb, var(--text-secondary) 40%, transparent) transparent',
    margin: 0,
    padding: '6px',
    listStyle: 'none',
    borderRadius: '14px',
    backgroundColor: 'var(--modal-bg)',
    border: '1px solid var(--border-strong)',
    boxShadow: '0 24px 50px rgba(0, 0, 0, 0.35)',
    outline: 'none',
  },
  option: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    padding: '6px 10px',
    borderRadius: '10px',
    cursor: 'pointer',
    color: 'var(--text-primary)',
  },
  optionShield: {
    height: '30px',
    width: '30px',
    objectFit: 'contain' as const,
    flexShrink: 0,
  },
  optionName: {
    fontSize: '14px',
    fontWeight: 600 as const,
  },
  optionCap: {
    marginLeft: 'auto',
    fontSize: '12px',
    fontWeight: 600 as const,
    color: 'var(--text-secondary)',
  },
};
