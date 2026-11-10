import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { usePlayerSwitcher } from '../hooks/usePlayerSwitcher';
import ThemeToggle from './ThemeToggle';
import PlayerMenu, { Avatar } from './PlayerMenu';
import { homePath, toolItems, FAQ_ITEM, type NavItem } from './navItems';
import { MailIcon, GitHubIcon, SwitchIcon } from './navIcons';
import { CONTACT_EMAIL_URL, GITHUB_URL } from '../lib/contact';

export default function Sidebar() {
  const { activePlayerTag } = useApp();
  const { pathname } = useLocation();
  const theme = getTheme();
  const navRef = useRef<HTMLElement>(null);
  const glideRef = useGlide(navRef, pathname);

  const renderNavLink = (item: NavItem) => (
    <NavLink
      key={item.label}
      to={item.to}
      end={item.end}
      className="nav-link"
      style={({ isActive }) => ({
        ...styles.navLink,
        color: isActive ? theme.accent : theme.text.secondary,
      })}
    >
      <span style={styles.navIcon} aria-hidden="true">{item.icon}</span>
      {item.label}
    </NavLink>
  );

  return (
    <nav
      ref={navRef}
      aria-label="Main menu"
      style={{
        ...styles.sidebar,
        backgroundColor: theme.bg.secondary,
        borderRightColor: theme.border,
      }}
    >
      <span ref={glideRef} className="nav-glide" style={{ ...styles.glide, boxShadow: `inset 3px 0 0 ${theme.accent}` }} />

      <Link
        to={homePath(activePlayerTag)}
        className="brand-link"
        aria-label="Royale Decklab, home"
        style={{ ...styles.brand, color: theme.text.primary }}
      >
        <div style={styles.brandTop}>ROYALE</div>
        <div style={styles.brandBottom}>DECKLAB</div>
      </Link>

      <div style={styles.navList}>{[...toolItems(activePlayerTag), FAQ_ITEM].map(renderNavLink)}</div>

      <div style={styles.footer}>
        <div style={styles.footerIcons}>
          <a
            href={CONTACT_EMAIL_URL}
            className="nav-link"
            aria-label="Contact"
            title="Contact"
            style={{ ...styles.iconButton, color: theme.text.secondary, borderColor: theme.border }}
          >
            <MailIcon />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="nav-link"
            aria-label="GitHub repository"
            title="GitHub"
            style={{ ...styles.iconButton, color: theme.text.secondary, borderColor: theme.border }}
          >
            <GitHubIcon />
          </a>
          <span style={{ flex: 1 }} />
          <ThemeToggle
            size={18}
            style={{ ...styles.iconButton, color: theme.text.secondary, borderColor: theme.border, padding: 0 }}
          />
        </div>

        <PlayerCard />
      </div>
    </nav>
  );
}

function PlayerCard() {
  const theme = getTheme();
  const switcher = usePlayerSwitcher();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target instanceof Node ? e.target : null;
      if (!wrapRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!switcher.tag && switcher.others.length === 0) return null;

  return (
    <div ref={wrapRef} style={{ ...styles.playerWrap, borderTopColor: theme.border }}>
      {open && (
        <div
          id="player-menu"
          className="gc-menu"
          style={{
            ...styles.popover,
            borderColor: 'var(--border-strong)',
          }}
        >
          <PlayerMenu switcher={switcher} theme={theme} onDone={() => setOpen(false)} />
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        className="nav-link"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="player-menu"
        aria-label={switcher.tag ? `Player ${switcher.name ?? switcher.tag}, switch player` : 'Switch player'}
        style={{
          ...styles.navLink,
          ...styles.plainButton,
          color: theme.text.primary,
          backgroundColor: open ? 'var(--nav-active-bg)' : 'transparent',
        }}
      >
        <Avatar name={switcher.name} empty={!switcher.tag} />
        <span style={styles.playerName}>{switcher.tag ? (switcher.name ?? switcher.tag) : 'Switch player'}</span>
        <span style={{ ...styles.switchIcon, color: theme.text.tertiary }} aria-hidden="true">
          <SwitchIcon />
        </span>
      </button>
    </div>
  );
}

/**
 * One highlight behind the active link that glides to the next one when the page changes.
 * Anything else that moves the links, such as resizing the window, places it without a glide.
 */
function useGlide(navRef: RefObject<HTMLElement | null>, pathname: string) {
  const glideRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef(false);

  const place = (glide: boolean) => {
    const nav = navRef.current;
    const el = glideRef.current;
    if (!nav || !el) return;
    const link = nav.querySelector<HTMLElement>('.nav-link.active');
    if (!link) {
      el.style.opacity = '0';
      shownRef.current = false;
      return;
    }
    const n = nav.getBoundingClientRect();
    const l = link.getBoundingClientRect();
    const instant = !glide || !shownRef.current;
    if (instant) el.style.transition = 'none';
    el.style.transform = `translate(${l.left - n.left}px, ${l.top - n.top}px)`;
    el.style.width = `${l.width}px`;
    el.style.height = `${l.height}px`;
    el.style.opacity = '1';
    if (instant) {
      void el.offsetWidth;
      el.style.transition = '';
    }
    shownRef.current = true;
  };

  useLayoutEffect(() => place(true), [pathname]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  return glideRef;
}

const styles = {
  sidebar: {
    width: '240px',
    flexShrink: 0,
    minHeight: '100vh',
    borderRight: '1px solid',
    padding: '24px 16px 16px',
    boxSizing: 'border-box' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 20,
    alignSelf: 'flex-start' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  glide: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    opacity: 0,
    borderRadius: '8px',
    backgroundColor: 'var(--nav-active-bg)',
    pointerEvents: 'none' as const,
  },
  brand: {
    alignSelf: 'flex-start' as const,
    marginBottom: '32px',
    paddingLeft: '8px',
    paddingRight: '4px',
    borderRadius: '8px',
    lineHeight: 1.05,
    textDecoration: 'none',
  },
  brandTop: {
    fontSize: '28px',
    fontWeight: 700 as const,
    letterSpacing: '1px',
    textAlign: 'right' as const,
  },
  brandBottom: {
    fontSize: '38px',
    fontWeight: 800 as const,
    letterSpacing: '1px',
  },
  navList: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '6px',
  },
  navLink: {
    position: 'relative' as const,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '11px',
    padding: '12px 14px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '15px',
    fontWeight: 600 as const,
  },
  plainButton: {
    width: '100%',
    border: 'none',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'left' as const,
    cursor: 'pointer',
  },
  navIcon: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexShrink: 0,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '16px',
  },
  footerIcons: {
    display: 'flex' as const,
    gap: '8px',
    padding: '12px 8px',
  },
  iconButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '36px',
    height: '36px',
    boxSizing: 'border-box' as const,
    borderRadius: '50%',
    border: '1px solid',
    textDecoration: 'none',
    flexShrink: 0,
  },
  playerWrap: {
    position: 'relative' as const,
    paddingTop: '12px',
    borderTop: '1px solid',
  },
  playerName: {
    flex: 1,
    minWidth: 0,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
  },
  switchIcon: {
    display: 'inline-flex' as const,
    flexShrink: 0,
  },
  popover: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 'calc(100% + 8px)',
    zIndex: 30,
    padding: '6px',
    borderRadius: '12px',
    border: '1px solid',
    backgroundColor: 'var(--modal-bg)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
  },
};
