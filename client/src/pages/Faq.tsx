import { useState } from 'react';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { faqItems } from './faqContent';

export default function Faq() {
  const { isDarkMode } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div style={{ ...styles.container, padding: isMobile ? '4px 0' : '20px 0' }}>
      <div
        style={{
          ...styles.header,
          borderBottomColor: theme.border,
          marginBottom: isMobile ? '20px' : '30px',
          paddingBottom: isMobile ? '14px' : '20px',
        }}
      >
        <h2 style={{ color: theme.text.primary, margin: 0 }}>FAQ</h2>
        <p style={{ ...styles.subtitle, color: theme.text.secondary }}>
          How the War Deck Generator scores and ranks decks.
        </p>
      </div>

      <div style={{ ...styles.list, backgroundColor: theme.bg.secondary, borderColor: theme.border }}>
        {faqItems.map((item, i) => {
          const isOpen = openIndex === i;
          const panelId = `faq-panel-${i}`;
          const buttonId = `faq-button-${i}`;
          return (
            <div
              key={item.question}
              style={{
                borderBottom: i === faqItems.length - 1 ? 'none' : `1px solid ${theme.border}`,
              }}
            >
              <h3 style={styles.questionHeading}>
                <button
                  id={buttonId}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  style={{ ...styles.trigger, padding: isMobile ? '15px 16px' : '18px 22px', color: theme.text.primary }}
                >
                  <span>{item.question}</span>
                  <Chevron open={isOpen} color={theme.text.secondary} />
                </button>
              </h3>
              {isOpen && (
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  style={{ padding: isMobile ? '0 16px 18px' : '0 22px 20px', color: theme.text.secondary }}
                >
                  {item.answer}
                </div>
              )}
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
        // stroke via CSS, not the attribute: var() only resolves in a CSS property.
        stroke: color,
        flexShrink: 0,
        marginLeft: '12px',
        transition: 'transform 0.2s ease',
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
  subtitle: {
    fontSize: '15px',
    margin: '8px 0 0',
  },
  header: {
    borderBottom: '1px solid',
  },
  list: {
    border: '1px solid',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  questionHeading: {
    margin: 0,
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
  },
};
