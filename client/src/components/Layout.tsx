import { Suspense, useEffect, useRef } from 'react';
import { Outlet, useLocation, useMatch, useNavigate, useNavigationType } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Footer from './Footer';
import { ElixirGradientDefs } from './ElixirBadge';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePrefetchAppData } from '../queries';
import { isValidTag } from '../lib/playerTag';
import { documentMeta, toolItems } from './navItems';

// Where each history entry was scrolled to, so going back returns there.
const scrollPositions = new Map<string, number>();

const STATIC_PATHS = new Set(['builder', 'faq', 'best-decks', 'upgrades']);

export default function Layout() {
  const { activePlayerTag, setActivePlayerTag } = useApp();
  const navigate = useNavigate();
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);
  const theme = getTheme();
  const isMobile = useIsMobile();

  const playerMatch = useMatch('/:playerId');
  const isPlayerDeepLink =
    !!playerMatch?.params.playerId && isValidTag(playerMatch.params.playerId);

  const badTag = playerMatch?.params.playerId;
  const isMalformedTagLink = !!badTag && !STATIC_PATHS.has(badTag) && !isValidTag(badTag);
  useEffect(() => {
    if (isMalformedTagLink) {
      setActivePlayerTag(null);
      navigate('/', {
        replace: true,
        state: {
          tagError: "That doesn't look like a valid player tag; check it on your in-game profile.",
          badTag,
        },
      });
    }
  }, [isMalformedTagLink, badTag]);

  useEffect(() => {
    // Leaving a long page for a shorter one clamps the scroll, and that event can arrive after the
    // URL has changed; only positions taken while this entry is still current count.
    const save = () => {
      if ((window.history.state?.key ?? 'default') === key) scrollPositions.set(key, window.scrollY);
    };
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, [key]);

  // Back and forward return to where that page was left; a new page starts at the top.
  useEffect(() => {
    const saved = scrollPositions.get(key);
    if (navigationType === 'POP' && saved != null) window.scrollTo(0, saved);
    else if (pathname !== lastPathname.current) window.scrollTo(0, 0);
    lastPathname.current = pathname;
  }, [key]);

  usePrefetchAppData(activePlayerTag);

  const { title, description } = documentMeta(pathname, toolItems(activePlayerTag), isPlayerDeepLink);
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description]);

  return (
    <div
      style={{
        ...styles.shell,
        flexDirection: isMobile ? 'column' : 'row',
        backgroundColor: theme.bg.primary,
        color: theme.text.primary,
      }}
    >
      <a
        href="#main-content"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {isMobile ? <MobileNav /> : <Sidebar />}
      <main
        id="main-content"
        tabIndex={-1}
        style={{
          ...styles.content,
          padding: isMobile ? '12px' : '20px',
          ...(isMobile
            ? {
                maxWidth: '560px',
                margin: '0 auto',
                width: '100%',
                paddingBottom: 'calc(76px + env(safe-area-inset-bottom))',
              }
            : {}),
        }}
      >
        <ElixirGradientDefs />
        {/* Grows to fill the screen, so the footer stays at the bottom even on short pages. */}
        <div style={styles.page}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
        <Footer />
      </main>
    </div>
  );
}

const styles = {
  shell: {
    display: 'flex' as const,
    minHeight: '100dvh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  content: {
    flex: 1,
    minWidth: 0,
    padding: '20px',
    position: 'relative' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  page: {
    flex: '1 0 auto',
  },
};
