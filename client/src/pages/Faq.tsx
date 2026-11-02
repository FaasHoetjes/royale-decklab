import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { GridIcon, SearchIcon, TrendingUpIcon, TrophyIcon, ZapIcon } from '../components/navIcons';
import Fold from '../components/Fold';
import { faqItems, type FaqPage } from './faqContent';

// Pages behind a player tag send visitors without one to the tag search instead.
function pageLink(page: FaqPage, playerTag: string | null): { to: string; label: string; icon: ReactNode } {
  if (page === 'best-decks') return { to: '/best-decks', label: 'See the Best War Decks', icon: <TrophyIcon /> };
  if (!playerTag) return { to: '/', label: 'Search your player tag', icon: <SearchIcon /> };
  if (page === 'generator') {
    return { to: `/${playerTag.replace(/#/g, '')}`, label: 'Open the War Deck Generator', icon: <ZapIcon /> };
  }
  if (page === 'builder') return { to: '/builder', label: 'Open the War Deck Builder', icon: <GridIcon /> };
  return { to: '/upgrades', label: 'Open the Upgrade Advisor', icon: <TrendingUpIcon /> };
}

export default function Faq() {
  const theme = getTheme();
  const isMobile = useIsMobile();
  const { activePlayerTag } = useApp();
  const { hash } = useLocation();
  const [openIndex, setOpenIndex] = useState<number | null>(() => {
    const linked = faqItems.findIndex((item) => item.id === hash.slice(1));
    return linked >= 0 ? linked : 0;
  });

  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return;
    const idx = faqItems.findIndex((item) => item.id === id);
    if (idx < 0) return;
    setOpenIndex(idx);
    const offset = isMobile ? 64 : 16;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    });
  }, [hash, isMobile]);

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      {isMobile ? (
        <h1 className="visually-hidden">FAQ</h1>
      ) : (
        <div
          style={{
            ...styles.header,
            borderBottomColor: theme.border,
            marginBottom: '30px',
            paddingBottom: '20px',
          }}
        >
          <h1 style={{ color: theme.text.primary, margin: 0, fontSize: '1.5em' }}>FAQ</h1>
        </div>
      )}

      <div style={{ ...styles.list, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
        {faqItems.map((item, i) => {
          const isOpen = openIndex === i;
          const panelId = `faq-panel-${i}`;
          const buttonId = `faq-button-${i}`;
          const link = item.link ? pageLink(item.link, activePlayerTag) : null;
          return (
            <div
              key={item.question}
              id={item.id}
              style={{
                ...styles.item,
                borderBottom: i === faqItems.length - 1 ? 'none' : `1px solid ${theme.border}`,
                boxShadow: isOpen ? `inset 3px 0 0 ${theme.accent}` : 'none',
              }}
            >
              <h3 style={styles.questionHeading}>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  style={{
                    ...styles.trigger,
                    padding: isMobile ? '15px 16px' : '18px 22px',
                    color: isOpen ? theme.accent : theme.text.primary,
                  }}
                >
                  <span>{item.question}</span>
                  <Chevron open={isOpen} color={isOpen ? theme.accent : theme.text.secondary} />
                </button>
              </h3>
              <Fold id={panelId} role="region" aria-labelledby={buttonId} open={isOpen}>
                <div style={{ padding: isMobile ? '0 16px 18px' : '0 22px 20px', color: theme.text.secondary }}>
                  {item.answer}
                  {link && (
                    <Link to={link.to} className="faq-page-link" style={{ ...styles.pageLink, color: theme.accent }}>
                      <span style={styles.pageLinkIcon} aria-hidden="true">
                        {link.icon}
                      </span>
                      <span className="faq-page-link-label">{link.label}</span>
                      <svg
                        className="faq-page-link-arrow"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                        style={styles.pageLinkArrow}
                      >
                        <path d="M5 12h14" />
                        <path d="m13 6 6 6-6 6" />
                      </svg>
                    </Link>
                  )}
                </div>
              </Fold>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Chevron({ open, color }: { open: boolean; color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        stroke: color,
        flexShrink: 0,
        marginLeft: '12px',
        transition: 'transform 0.3s ease, stroke 0.3s ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const styles = {
  container: {
    maxWidth: '760px',
    margin: '0 auto',
  },
  header: {
    borderBottom: '1px solid',
  },
  list: {
    border: '1px solid',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  item: {
    transition: 'box-shadow 0.3s ease',
  },
  questionHeading: {
    margin: 0,
  },
  pageLink: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    marginTop: '14px',
    fontSize: '15px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  pageLinkIcon: {
    display: 'inline-flex' as const,
    flexShrink: 0,
  },
  pageLinkArrow: {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    transition: 'transform 0.2s ease',
  },
  trigger: {
    width: '100%',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '8px',
    textAlign: 'left' as const,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: 600 as const,
    lineHeight: 1.4,
    transition: 'color 0.3s ease',
  },
};
