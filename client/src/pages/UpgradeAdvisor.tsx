import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../AppContext';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { useUpgradeAdvice } from '../queries';
import UpgradeRow from '../components/UpgradeRow';
import { UpgradeAdvisorSkeleton } from '../components/LoadingSkeletons';
import type { UpgradeSuggestion } from '../api';

const INITIAL_ROWS = 10;

type Filter = 'all' | 'lineup' | 'new';

const FILTERS: { key: Filter; label: string; empty: string }[] = [
  { key: 'all', label: 'All', empty: '' },
  {
    key: 'lineup',
    label: 'Current decks',
    empty: 'No upgrade improves a deck in your current lineup. Those cards are already maxed.',
  },
  {
    key: 'new',
    label: 'Unlocks new deck',
    empty: 'No upgrade brings a new deck into your lineup right now.',
  },
];

function matches(s: UpgradeSuggestion, filter: Filter): boolean {
  if (filter === 'lineup') return s.affectedDeckIndexes.length > 0;
  if (filter === 'new') return s.changesLineup;
  return true;
}

export default function UpgradeAdvisor() {
  const { activePlayerTag } = useApp();
  const theme = getTheme();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);

  const advice = useUpgradeAdvice(activePlayerTag);
  const data = advice.data;
  const filtered = data?.suggestions.filter((s) => matches(s, filter)) ?? [];
  const visible = expanded ? filtered : filtered.slice(0, INITIAL_ROWS);
  const maxDelta = filtered[0]?.scoreDelta ?? 0;
  const countFor = (f: Filter) => data?.suggestions.filter((s) => matches(s, f)).length ?? 0;

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
        {!isMobile && (
          <div style={styles.titleRow}>
            <h2 style={{ color: theme.text.primary, margin: 0 }}>Upgrade Advisor</h2>
            {data && (
              <ScoreSummary score={data.baselineScore} accent={theme.accent} text={theme.text.primary} muted={theme.text.secondary} border={theme.border} />
            )}
          </div>
        )}
        <p
          style={{
            ...styles.subtitle,
            marginTop: isMobile ? 0 : '8px',
            color: theme.text.secondary,
          }}
        >
          Ranked by the increase each upgrade gives your best war lineup. Each result is tested
          against a rebuilt lineup. <strong>Unlocks a new deck</strong> means the upgrade changes
          your four decks.
        </p>
        {isMobile && data && (
          <ScoreSummary
            score={data.baselineScore}
            accent={theme.accent}
            text={theme.text.primary}
            muted={theme.text.secondary}
            border={theme.border}
            fullWidth
          />
        )}
      </div>

      {!activePlayerTag ? (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          <p style={{ ...styles.panelText, color: theme.text.secondary }}>
            Upgrade advice uses your card collection. Search your player tag first.
          </p>
          <Link
            to="/"
            style={{ ...styles.panelButton, backgroundColor: theme.accent, color: theme.onAccent }}
          >
            Search your player tag
          </Link>
        </div>
      ) : advice.isLoading ? (
        <UpgradeAdvisorSkeleton isMobile={isMobile} />
      ) : advice.isError ? (
        <p style={{ ...styles.message, color: '#e05c5c' }}>
          Failed to load: {advice.error instanceof Error ? advice.error.message : 'Unknown error'}
        </p>
      ) : data && data.suggestions.length === 0 ? (
        <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
          {data.collectionMaxed ? (
            <>
              <p style={{ ...styles.panelTitle, color: theme.text.primary }}>
                All relevant upgrades are complete
              </p>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                Every card used in the current meta is maxed, and its Evolutions and Heroes are
                unlocked. Check back when the meta changes or new cards arrive.
              </p>
            </>
          ) : (
            <>
              <p style={{ ...styles.panelTitle, color: theme.text.primary }}>
                Your recommended lineup is fully upgraded
              </p>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                No available upgrade improves your recommended lineup or brings in a stronger deck.
                Check back when the meta changes.
              </p>
            </>
          )}
        </div>
      ) : data ? (
        <>
          <div style={{ ...styles.list, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
            <div style={{ ...styles.tabRow, borderBottomColor: theme.border }}>
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    className="mobile-touch-target"
                    key={f.key}
                    onClick={() => {
                      setFilter(f.key);
                      setExpanded(false);
                    }}
                    style={{
                      ...styles.tab,
                      padding: isMobile ? '12px 6px' : '13px 12px',
                      fontSize: isMobile ? '12px' : '13px',
                      color: active ? theme.accent : theme.text.secondary,
                      borderBottomColor: active ? theme.accent : 'transparent',
                      fontWeight: active ? 700 : 600,
                    }}
                  >
                    {f.label}
                    <span
                      style={{
                        ...styles.tabCount,
                        backgroundColor: active ? theme.accent : theme.bg.tertiary,
                        color: active ? theme.onAccent : theme.text.secondary,
                      }}
                    >
                      {countFor(f.key)}
                    </span>
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <p style={{ ...styles.emptyTab, color: theme.text.secondary }}>
                {FILTERS.find((f) => f.key === filter)?.empty}
              </p>
            ) : (
              <>
                {visible.map((s, i) => (
                  <div
                    key={`${s.cardId}-${s.kind}-${s.toLevel}`}
                    style={{
                      borderBottom:
                        i === visible.length - 1 ? 'none' : `1px solid ${theme.border}`,
                    }}
                  >
                    <UpgradeRow
                      rank={i + 1}
                      suggestion={s}
                      relativeGain={maxDelta > 0 ? s.scoreDelta / maxDelta : 0}
                      baselineScore={data.baselineScore}
                      theme={theme}
                      isMobile={isMobile}
                    />
                  </div>
                ))}
                {filtered.length > INITIAL_ROWS && (
                  <button
                    className="mobile-touch-target"
                    onClick={() => setExpanded((e) => !e)}
                    style={{
                      ...styles.showMore,
                      color: theme.accent,
                      borderTopColor: theme.border,
                    }}
                  >
                    {expanded ? 'Show fewer' : `Show all ${filtered.length}`}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ScoreSummary({
  score,
  accent,
  text,
  muted,
  border,
  fullWidth = false,
}: {
  score: number;
  accent: string;
  text: string;
  muted: string;
  border: string;
  fullWidth?: boolean;
}) {
  return (
    <span
      style={{
        ...styles.scorePill,
        ...(fullWidth ? styles.scoreSummaryMobile : {}),
        color: text,
        borderColor: border,
      }}
      title="Your current lineup score. Each suggestion shows how much it can raise it."
    >
      <span style={{ ...styles.scorePillLabel, color: muted }}>Current Score</span>
      <span style={{ color: accent }}>{score.toFixed(3)}</span>
    </span>
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
  scoreSummaryMobile: {
    display: 'flex' as const,
    width: 'fit-content',
    justifyContent: 'center' as const,
    margin: '14px auto 0',
    boxSizing: 'border-box' as const,
  },
  subtitle: {
    fontSize: '15px',
    marginTop: '8px',
    lineHeight: 1.6,
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
  panelTitle: {
    fontSize: '17px',
    fontWeight: 800 as const,
    margin: '0 0 8px',
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
  tabRow: {
    display: 'flex' as const,
    borderBottom: '1px solid',
  },
  tab: {
    flex: 1,
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    background: 'none',
    cursor: 'pointer' as const,
    whiteSpace: 'nowrap' as const,
  },
  tabCount: {
    fontSize: '11px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    padding: '1px 7px',
    borderRadius: '999px',
    lineHeight: 1.5,
  },
  emptyTab: {
    fontSize: '14px',
    lineHeight: 1.6,
    margin: 0,
    padding: '24px 20px',
    textAlign: 'center' as const,
  },
  list: {
    border: '1px solid',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  showMore: {
    display: 'block' as const,
    width: '100%',
    padding: '12px',
    border: 'none',
    borderTop: '1px solid',
    background: 'none',
    fontSize: '13px',
    fontWeight: 700 as const,
    cursor: 'pointer' as const,
  },
};
