import { Suspense, useEffect, useRef, type SyntheticEvent } from 'react';
import { Outlet, useLocation, useMatch, useNavigationType } from 'react-router-dom';
import Sidebar from './Sidebar';
import MobileNav from './MobileNav';
import Footer from './Footer';
import MetaLoadingNotice from './MetaLoadingNotice';
import { ElixirGradientDefs } from './ElixirBadge';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePrefetchAppData } from '../queries';
import { isValidTag } from '../lib/playerTag';
import { documentMeta, toolItems } from './navItems';
import { startPresence } from '../lib/live';
import { toolForPath, track } from '../lib/stats';
import { preloadPage } from '../lib/pageLoaders';

// Where each history entry was scrolled to, so going back returns there.
const scrollPositions = new Map<string, number>();

function preloadLink({ target }: SyntheticEvent): void {
  const link = target instanceof Element ? target.closest<HTMLAnchorElement>('a[href]') : null;
  if (!link || link.origin !== window.location.origin || link.hasAttribute('download')) return;
  if (link.target && link.target !== '_self') return;
  preloadPage(link.pathname);
}

export default function Layout() {
  const { activePlayerTag } = useApp();
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const lastPathname = useRef(pathname);
  const theme = getTheme();
  const isMobile = useIsMobile();

  const playerMatch = useMatch('/:playerId');
  const isPlayerDeepLink =
    !!playerMatch?.params.playerId && isValidTag(playerMatch.params.playerId);

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

  useEffect(() => {
    const tool = toolForPath(pathname);
    if (tool) track({ kind: 'tool', tool });
  }, [pathname]);

  const isAdminPage = pathname.startsWith('/admin');
  useEffect(() => {
    if (isAdminPage) return;
    return startPresence();
  }, [isAdminPage]);

  const { title, description } = documentMeta(pathname, toolItems(activePlayerTag), isPlayerDeepLink);
  // A card page names its card in the title, so it sets its own once the card is known.
  const isCardPage = pathname.startsWith('/cards/');
  useEffect(() => {
    if (isCardPage) return;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  }, [title, description, isCardPage]);

  return (
    <div
      onPointerOver={preloadLink}
      onFocus={preloadLink}
      onPointerDown={preloadLink}
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
          padding: isMobile ? '12px 12px calc(76px + env(safe-area-inset-bottom))' : '20px',
          ...(isMobile
            ? {
                maxWidth: '560px',
                margin: '0 auto',
                width: '100%',
              }
            : {}),
        }}
      >
        <ElixirGradientDefs />
        {/* Grows to fill the screen, so the footer stays at the bottom even on short pages. */}
        <div className="layout-page" style={styles.page}>
          <MetaLoadingNotice />
          <Suspense fallback={<p role="status" style={{ padding: '20px 0', color: theme.text.secondary }}>Loading page…</p>}>
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
