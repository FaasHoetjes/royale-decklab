import type { Theme } from '../theme';
import { initialOf, type PlayerSwitcher } from '../hooks/usePlayerSwitcher';
import { CheckIcon, PlusIcon, SmallCloseIcon } from './navIcons';

interface PlayerMenuProps {
  switcher: PlayerSwitcher;
  theme: Theme;
  /** Called after any choice, so the menu around it can close. */
  onDone: () => void;
}

/** The active player, the others searched on this device to switch to, and a way to add one. */
export default function PlayerMenu({ switcher, theme, onDone }: PlayerMenuProps) {
  const { tag, name, others, switchTo, addPlayer, forget } = switcher;

  return (
    <div role="group" aria-label="Switch player" style={styles.list}>
      {tag && (
        <div style={{ ...styles.row, backgroundColor: 'var(--nav-active-bg)' }}>
          <Avatar name={name} />
          <PlayerText name={name} tag={tag} theme={theme} />
          <span style={{ ...styles.end, color: theme.accent }} aria-label="Current player">
            <CheckIcon />
          </span>
        </div>
      )}
      {others.map((p) => (
        <div key={p.tag} style={styles.otherRow}>
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              switchTo(p.tag);
              onDone();
            }}
            style={{ ...styles.row, ...styles.rowButton, color: theme.text.primary }}
          >
            <Avatar name={p.name} />
            <PlayerText name={p.name} tag={p.tag} theme={theme} />
          </button>
          <button
            type="button"
            className="nav-link"
            onClick={() => forget(p.tag)}
            title={`Remove ${p.name} from this list`}
            aria-label={`Remove ${p.name} from this list`}
            style={{ ...styles.forget, color: theme.text.tertiary }}
          >
            <SmallCloseIcon />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="nav-link"
        onClick={() => {
          addPlayer();
          onDone();
        }}
        style={{ ...styles.row, ...styles.rowButton, ...styles.add, color: theme.accent }}
      >
        <span style={styles.addIcon}>
          <PlusIcon />
        </span>
        Add another player
      </button>
    </div>
  );
}

export function Avatar({ name, size = 30 }: { name: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ ...styles.avatar, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.45)}px` }}
    >
      {initialOf(name)}
    </span>
  );
}

export function PlayerText({ name, tag, theme }: { name: string | null; tag: string; theme: Theme }) {
  return (
    <span style={styles.text}>
      <span style={{ ...styles.name, color: theme.text.primary }}>{name ?? tag}</span>
      {name && <span style={{ ...styles.tag, color: theme.text.tertiary }}>{tag}</span>}
    </span>
  );
}

const styles = {
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '2px',
  },
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    padding: '8px',
    borderRadius: '8px',
    minWidth: 0,
  },
  otherRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '2px',
  },
  rowButton: {
    flex: 1,
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  end: {
    marginLeft: 'auto',
    display: 'inline-flex' as const,
    flexShrink: 0,
  },
  forget: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '30px',
    height: '30px',
    flexShrink: 0,
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  add: {
    fontSize: '13.5px',
    fontWeight: 600 as const,
  },
  addIcon: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '30px',
    height: '30px',
    flexShrink: 0,
  },
  avatar: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    borderRadius: '50%',
    fontWeight: 800 as const,
    color: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 16%, var(--bg-tertiary))',
  },
  text: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minWidth: 0,
    lineHeight: 1.25,
  },
  name: {
    fontSize: '14px',
    fontWeight: 700 as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  tag: {
    fontSize: '11.5px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
};
