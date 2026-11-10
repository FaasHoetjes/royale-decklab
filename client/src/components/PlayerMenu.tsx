import type { Theme } from '../theme';
import { initialOf, type PlayerSwitcher } from '../hooks/usePlayerSwitcher';
import { CheckIcon, PlusIcon, SmallCloseIcon, SwitchIcon } from './navIcons';

interface PlayerMenuProps {
  switcher: PlayerSwitcher;
  theme: Theme;
  /** Called after any choice, so the menu around it can close. */
  onDone: () => void;
}

export default function PlayerMenu({ switcher, theme, onDone }: PlayerMenuProps) {
  const { tag, name, others, switchTo, addPlayer, forget } = switcher;

  return (
    <div role="group" aria-label="Switch player" style={styles.list}>
      {tag && (
        <div title={tag} style={{ ...styles.row, color: theme.text.primary, backgroundColor: 'var(--nav-active-bg)' }}>
          <Avatar name={name} />
          <span style={styles.name}>{name ?? tag}</span>
          <span style={{ ...styles.check, color: theme.accent }} aria-label="Current player">
            <CheckIcon />
          </span>
        </div>
      )}
      {others.map((p) => (
        <div key={p.tag} className="nav-link" style={{ ...styles.row, ...styles.otherRow }}>
          <button
            type="button"
            title={p.tag}
            onClick={() => {
              switchTo(p.tag);
              onDone();
            }}
            style={{ ...styles.plainButton, ...styles.pick, color: theme.text.secondary }}
          >
            <Avatar name={p.name} />
            <span style={styles.name}>{p.name}</span>
          </button>
          <button
            type="button"
            className="nav-link"
            onClick={() => forget(p.tag)}
            title={`Remove ${p.name} from this list`}
            aria-label={`Remove ${p.name} from this list`}
            style={{ ...styles.plainButton, ...styles.forget, color: theme.text.tertiary }}
          >
            <SmallCloseIcon />
          </button>
        </div>
      ))}
      {(tag || others.length > 0) && <div style={{ ...styles.separator, backgroundColor: theme.border }} />}
      <button
        type="button"
        className="nav-link"
        onClick={() => {
          addPlayer();
          onDone();
        }}
        style={{ ...styles.row, ...styles.plainButton, color: theme.text.secondary }}
      >
        <span style={styles.iconSlot}>
          <PlusIcon />
        </span>
        Add another player
      </button>
    </div>
  );
}

/** A round initial, sized to sit in the nav's icon column; with no player it shows the switch arrows. */
export function Avatar({ name, empty = false, size = 22 }: { name: string | null; empty?: boolean; size?: number }) {
  const box = { width: `${size}px`, height: `${size}px` };
  if (empty) {
    return (
      <span aria-hidden="true" style={{ ...styles.avatar, ...styles.emptyAvatar, ...box }}>
        <SwitchIcon />
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={{ ...styles.avatar, ...styles.filledAvatar, ...box, fontSize: `${Math.round(size * 0.45)}px` }}>
      {initialOf(name)}
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
    gap: '11px',
    width: '100%',
    minWidth: 0,
    padding: '10px 10px 10px 14px',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600 as const,
  },
  otherRow: {
    padding: '0 4px 0 0',
    gap: '2px',
  },
  plainButton: {
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    fontWeight: 'inherit' as const,
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  pick: {
    flex: 1,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '11px',
    minWidth: 0,
    padding: '10px 0 10px 14px',
  },
  name: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  check: {
    display: 'inline-flex' as const,
    flexShrink: 0,
  },
  forget: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: '8px',
  },
  separator: {
    height: '1px',
    margin: '4px 8px',
  },
  iconSlot: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '22px',
    height: '22px',
    flexShrink: 0,
  },
  avatar: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
    borderRadius: '50%',
    boxSizing: 'border-box' as const,
  },
  filledAvatar: {
    fontWeight: 800 as const,
    color: 'var(--accent)',
    backgroundColor: 'color-mix(in srgb, var(--accent) 16%, var(--bg-tertiary))',
  },
  emptyAvatar: {
    color: 'var(--text-tertiary)',
    border: '1.5px dashed var(--border-strong)',
  },
};
