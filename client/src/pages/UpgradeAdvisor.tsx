import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useUpgradeAdvice } from '../queries';
import UpgradeRow from '../components/UpgradeRow';

export default function UpgradeAdvisor() {
  const { isDarkMode, activePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const isMobile = useIsMobile();

  const advice = useUpgradeAdvice(activePlayerTag);
  const data = advice.data;
  // The top suggestion anchors the relative-gain bars.
  const maxDelta = data?.suggestions[0]?.scoreDelta ?? 0;

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
        <div style={styles.titleRow}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>Upgrade Advisor</h2>
          {data && (
            <span
              style={{ ...styles.scorePill, color: theme.text.primary, borderColor: theme.border }}
              title="Your recommended war lineup's total score today — the reference every suggestion is measured against."
            >
              <span style={{ ...styles.scorePillLabel, color: theme.text.secondary }}>Current Score</span>
              <span style={{ color: theme.accent }}>{data.baselineScore.toFixed(3)}</span>
            </span>
          )}
        </div>
        <p style={{ ...styles.subtitle, color: theme.text.secondary }}>
          Where your next upgrade earns the most: card levels ranked by how much they raise your
          recommended war lineup's total score.
        </p>
      </div>

      {!activePlayerTag ? (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          <p style={{ ...styles.panelText, color: theme.text.secondary }}>
            Upgrade advice is computed from your card collection, so we need to know who you are
            first.
          </p>
          <Link
            to="/"
            style={{ ...styles.panelButton, backgroundColor: theme.accent, color: theme.onAccent }}
          >
            Search your player tag
          </Link>
        </div>
      ) : advice.isLoading ? (
        <p style={{ ...styles.message, color: theme.text.secondary }}>Simulating your upgrades…</p>
      ) : advice.isError ? (
        <p style={{ ...styles.message, color: '#e05c5c' }}>
          Failed to load: {advice.error instanceof Error ? advice.error.message : 'Unknown error'}
        </p>
      ) : data && data.suggestions.length === 0 ? (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          <p style={{ ...styles.panelText, color: theme.text.secondary }}>
            No single card upgrade moves your recommended lineup right now — the cards it relies on
            are already maxed. Check back after the meta shifts.
          </p>
        </div>
      ) : data ? (
        <>
          <div style={{ ...styles.list, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
            {data.suggestions.map((s, i) => (
              <div
                key={s.cardId}
                style={{
                  borderBottom: i === data.suggestions.length - 1 ? 'none' : `1px solid ${theme.border}`,
                }}
              >
                <UpgradeRow
                  rank={i + 1}
                  suggestion={s}
                  relativeGain={maxDelta > 0 ? s.scoreDelta / maxDelta : 0}
                  baselineScore={data.baselineScore}
                  isDarkMode={isDarkMode}
                  theme={theme}
                  isMobile={isMobile}
                />
              </div>
            ))}
          </div>
          <p style={{ ...styles.footnote, color: theme.text.secondary }}>
            Each suggestion is a simulation: that one card is raised a level, your best four war
            decks are rebuilt from scratch, and the change in total score is measured. An upgrade
            marked <strong>Unlocks a new deck</strong> would pull a stronger deck into your lineup,
            not just improve a current one.
          </p>
        </>
      ) : null}
    </div>
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
  titleRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '16px',
    flexWrap: 'wrap' as const,
  },
  scorePill: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    padding: '6px 14px',
    borderRadius: '999px',
    border: '1.5px solid',
    fontSize: '16px',
    fontWeight: 800 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    cursor: 'help' as const,
  },
  scorePillLabel: {
    fontSize: '11px',
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  subtitle: {
    fontSize: '15px',
    marginTop: '8px',
  },
  message: {
    marginTop: '32px',
  },
  panel: {
    border: '1px solid',
    borderRadius: '12px',
    padding: '28px 24px',
    textAlign: 'center' as const,
  },
  panelText: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 4px',
  },
  panelButton: {
    display: 'inline-block' as const,
    marginTop: '14px',
    padding: '10px 22px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 700 as const,
  },
  list: {
    border: '1px solid',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  footnote: {
    fontSize: '12px',
    lineHeight: 1.5,
    marginTop: '14px',
    maxWidth: '640px',
  },
};
