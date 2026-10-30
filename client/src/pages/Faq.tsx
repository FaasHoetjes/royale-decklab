import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { CONTACT_EMAIL_URL, GITHUB_URL } from '../lib/contact';
import { faqItems, type FaqPage } from './faqContent';

// Pages behind a player tag send visitors without one to the tag search instead.
function pageLink(page: FaqPage, playerTag: string | null): { to: string; label: string } {
  if (page === 'best-decks') return { to: '/best-decks', label: 'See the Best War Decks' };
  if (!playerTag) return { to: '/', label: 'Search your player tag' };
  if (page === 'generator') return { to: `/${playerTag.replace(/#/g, '')}`, label: 'Open the War Deck Generator' };
  if (page === 'builder') return { to: '/builder', label: 'Open the War Deck Builder' };
  return { to: '/upgrades', label: 'Open the Upgrade Advisor' };
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
      {!isMobile && (
        <div
          style={{
            ...styles.header,
            borderBottomColor: theme.border,
            marginBottom: '30px',
            paddingBottom: '20px',
          }}
        >
          <h2 style={{ color: theme.text.primary, margin: 0 }}>FAQ</h2>
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
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                style={{
                  ...styles.fold,
                  gridTemplateRows: isOpen ? '1fr' : '0fr',
                  opacity: isOpen ? 1 : 0,
                  visibility: isOpen ? 'visible' : 'hidden',
                  transition: isOpen ? styles.fold.transition : `${styles.fold.transition}, visibility 0s linear 0.3s`,
                }}
              >
                <div style={{ minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ padding: isMobile ? '0 16px 18px' : '0 22px 20px', color: theme.text.secondary }}>
                    {item.answer}
                    {link && (
                      <Link
                        to={link.to}
                        style={{ ...styles.pageLink, color: theme.accent, borderColor: theme.borderStrong }}
                      >
                        {link.label} →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          ...styles.contact,
          padding: isMobile ? '16px' : '18px 22px',
          backgroundColor: theme.bg.secondary,
          borderColor: theme.border,
        }}
      >
        <div>
          <p style={{ ...styles.contactTitle, color: theme.text.primary }}>Still have a question?</p>
          <p style={{ ...styles.contactText, color: theme.text.secondary }}>
            Send an email or open an issue on GitHub.
          </p>
        </div>
        <div style={styles.contactButtons}>
          <a
            href={CONTACT_EMAIL_URL}
            className="mobile-touch-target"
            style={{ ...styles.contactButton, backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent }}
          >
            Email
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mobile-touch-target"
            style={{ ...styles.contactButton, borderColor: theme.borderStrong, color: theme.text.primary }}
          >
            GitHub
          </a>
        </div>
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
    marginTop: '14px',
    padding: '6px 13px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  contact: {
    marginTop: '16px',
    border: '1px solid',
    borderRadius: '12px',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '14px',
    flexWrap: 'wrap' as const,
  },
  contactTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600 as const,
  },
  contactText: {
    margin: '2px 0 0',
    fontSize: '14px',
  },
  contactButtons: {
    display: 'flex' as const,
    gap: '8px',
  },
  contactButton: {
    padding: '8px 16px',
    border: '1px solid',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  fold: {
    display: 'grid' as const,
    transition: 'grid-template-rows 0.3s ease, opacity 0.25s ease',
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
