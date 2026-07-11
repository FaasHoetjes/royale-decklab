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
    empty: 'No upgrade improves a deck in your current lineup; those cards are already maxed.',
  },
  {
    key: 'new',
    label: 'Unlocks new deck',
    empty:
      'No single-card upgrade pulls a new deck into your lineup right now, not even taken all the way to max level, and no Evolution or Hero unlock does it either. Your top four are simply that far ahead.',
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
        <div style={styles.titleRow}>
          <h2 style={{ color: theme.text.primary, margin: 0 }}>Upgrade Advisor</h2>
          {data && (
            <span
              style={{ ...styles.scorePill, color: theme.text.primary, borderColor: theme.border }}
              title="Your recommended war lineup's total score today: the reference every suggestion is measured against."
            >
              <span style={{ ...styles.scorePillLabel, color: theme.text.secondary }}>Current Score</span>
              <span style={{ color: theme.accent }}>{data.baselineScore.toFixed(3)}</span>
            </span>
          )}
        </div>
        <p style={{ ...styles.subtitle, color: theme.text.secondary }}>
          Where your next upgrade earns the most: card levels and Evolution / Hero unlocks ranked
          by how much they raise your recommended war lineup's total score.
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
                Every card used by the current meta is at max level, and every Evolution and Hero
                it uses is unlocked. There are no upgrades for the advisor to recommend right now.
                Check back when the meta changes or new cards arrive.
              </p>
            </>
          ) : (
            <>
              <p style={{ ...styles.panelTitle, color: theme.text.primary }}>
                Your recommended lineup is fully upgraded
              </p>
              <p style={{ ...styles.panelText, color: theme.text.secondary }}>
                No remaining card-level upgrade, Evolution, or Hero unlock would improve your
                recommended lineup or bring a stronger deck into it right now. Check back when the
                meta changes.
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
          <p style={{ ...styles.footnote, color: theme.text.secondary }}>
            Each suggestion is a simulation: that one change is applied (a card level, a bigger
            level jump, or an Evolution / Hero unlock), your best four war decks are rebuilt from
            scratch, and the change in total score is measured. When one level isn't enough, the
            advisor also reports the smallest jump that would change your lineup. An upgrade
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
  footnote: {
    fontSize: '12px',
    lineHeight: 1.5,
    marginTop: '14px',
    maxWidth: '640px',
  },
};
