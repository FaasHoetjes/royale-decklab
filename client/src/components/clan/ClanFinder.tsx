import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../AppContext';
import type { ClanSummary } from '../../api';
import { getTheme } from '../../theme';
import { useClanSearch, usePlayerSummary } from '../../queries';
import { normalizeTag } from '../../lib/playerTag';
import { loadRecentClans, parseClanQuery, recentClansToShow, type ClanRef } from '../../lib/recentClans';
import { Skeleton } from '../LoadingSkeletons';
import ClanShield, { EmptyShield } from './ClanShield';

const SEARCH_DELAY_MS = 350;
const FULL_CLAN = 50;

const JOIN_TYPE_LABEL = { open: null, inviteOnly: 'Invite only', closed: 'Closed' } as const;

const clanPath = (tag: string) => `/clan/${normalizeTag(tag)}`;
const formatNumber = (n: number) => n.toLocaleString('en-US');

const useDebounced = <T,>(value: T, delayMs: number) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};

/** The active player's clan, for the way back after looking at another one. */
const useOwnClan = (): ClanRef | null => {
  const { activePlayerTag } = useApp();
  const player = usePlayerSummary(activePlayerTag).data;
  if (!player?.clanTag) return null;
  return { tag: player.clanTag, name: player.clanName ?? player.clanTag, badgeId: player.clanBadgeId ?? null };
};

interface ClanFinderProps {
  /** Shown under the heading, e.g. why the active player's clan couldn't be opened. */
  notice?: string;
}

/** Finds a clan by name, or opens one by tag, with shortcuts back to your own clan and the clans opened lately. */
const ClanFinder = ({ notice }: ClanFinderProps) => {
  const theme = getTheme();
  const navigate = useNavigate();
  const ownClan = useOwnClan();
  const [recent] = useState(loadRecentClans);
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const query = parseClanQuery(input);
  const search = useClanSearch(useDebounced(query.name, SEARCH_DELAY_MS));
  const results = query.name ? search.data : undefined;
  const best = results?.[0];
  const isSearching = query.name !== null || query.tag !== null;
  const shortcuts = recentClansToShow(recent, ownClan?.tag ?? null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const target = best?.tag ?? query.tag;
    if (target) navigate(clanPath(target));
  };

  return (
    <div style={styles.page}>
      {ownClan && (
        <Link to={clanPath(ownClan.tag)} style={{ ...styles.backLink, color: theme.text.secondary }}>
          <BackIcon />
          <ClanShield badgeId={ownClan.badgeId} size={18} />
          <span>
            Back to <b style={{ color: theme.text.primary, fontWeight: 600 }}>{ownClan.name}</b>
          </span>
        </Link>
      )}

      <div style={styles.hero}>
        {best ? <ClanShield badgeId={best.badgeId} size={52} /> : <EmptyShield size={52} mark />}
        <h2 style={{ ...styles.title, color: theme.text.primary }}>Find your clan</h2>
        <p style={notice ? { ...styles.tagline, ...styles.notice, color: theme.text.primary } : { ...styles.tagline, color: theme.text.secondary }}>
          {notice ?? 'Search by name, or paste a clan tag.'}
        </p>
      </div>

      <form role="search" onSubmit={submit}>
        <div
          style={{
            ...styles.field,
            backgroundColor: theme.bg.secondary,
            borderColor: focused ? theme.accent : theme.border,
            boxShadow: focused ? '0 0 0 3px var(--accent-a20)' : 'none',
            color: theme.text.secondary,
          }}
        >
          <SearchIcon />
          <input
            type="search"
            placeholder="Clan name or #tag"
            aria-label="Clan name or tag"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="search"
            style={{ ...styles.input, color: theme.text.primary }}
          />
        </div>
      </form>

      {isSearching ? (
        <Results query={query} results={results} best={best} failed={search.isError && !search.data} />
      ) : (
        <>
          <button
            type="button"
            className="mobile-touch-target"
            onClick={() => setShowHelp((show) => !show)}
            aria-expanded={showHelp}
            aria-controls="clan-tag-help"
            style={{ ...styles.helpButton, color: theme.accent }}
          >
            Where's my clan tag?
          </button>
          {showHelp && (
            <p id="clan-tag-help" style={{ ...styles.helpText, color: theme.text.secondary }}>
              In Clash Royale, open the Clan tab and tap your clan's name at the top. The clan tag sits under the name
              and starts with #. Tap it to copy, then paste it here, with or without the #.
            </p>
          )}
          {shortcuts.length > 0 && (
            <section aria-label="Recent clans" style={styles.recent}>
              <h3 style={{ ...styles.label, color: theme.text.secondary }}>Recent</h3>
              <div style={styles.chips}>
                {shortcuts.map((clan) => (
                  <Link
                    key={clan.tag}
                    to={clanPath(clan.tag)}
                    style={{ ...styles.chip, color: theme.text.primary, borderColor: theme.border, backgroundColor: theme.bg.secondary }}
                  >
                    <ClanShield badgeId={clan.badgeId} size={18} />
                    <span style={styles.chipName}>{clan.name}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default ClanFinder;

interface ResultsProps {
  query: { name: string | null; tag: string | null };
  results: ClanSummary[] | undefined;
  best: ClanSummary | undefined;
  failed: boolean;
}

const Results = ({ query, results, best, failed }: ResultsProps) => {
  const theme = getTheme();
  const offerTag = query.tag && !results?.some((c) => normalizeTag(c.tag) === query.tag);
  const listStyle = { ...styles.list, borderColor: theme.border, backgroundColor: theme.bg.secondary };

  const message = (text: string) => <p style={{ ...styles.message, color: theme.text.secondary }}>{text}</p>;

  return (
    <div style={styles.results}>
      {offerTag && (
        <ul style={listStyle}>
          <li>
            <Link to={clanPath(query.tag!)} style={{ ...styles.row, color: theme.text.primary }}>
              <EmptyShield size={32} />
              <span style={styles.rowMain}>
                <span style={styles.rowName}>Open clan #{query.tag}</span>
                <span style={{ ...styles.rowMeta, color: theme.text.secondary }}>By its tag</span>
              </span>
              <ChevronIcon />
            </Link>
          </li>
        </ul>
      )}

      {query.name && failed && message("Couldn't search clans right now. Try again in a moment, or paste the clan tag.")}
      {query.name && !failed && !results && (
        <ul style={listStyle} aria-busy="true" aria-label="Searching clans">
          {[0, 1, 2].map((row) => (
            <li key={row} style={{ ...styles.row, borderTop: row ? `1px solid ${theme.border}` : undefined }}>
              <Skeleton style={{ width: '32px', height: '38px', borderRadius: '8px' }} />
              <span style={{ ...styles.rowMain, gap: '6px' }}>
                <Skeleton style={{ width: '120px', height: '13px' }} />
                <Skeleton style={{ width: '160px', height: '11px' }} />
              </span>
            </li>
          ))}
        </ul>
      )}
      {query.name && results?.length === 0 && message(`No clans called "${query.name}". Try the clan tag instead.`)}
      {query.name && results && results.length > 0 && (
        <ul style={listStyle} aria-label="Clans found">
          {results.map((clan, i) => (
            <ResultRow key={clan.tag} clan={clan} isBest={clan === best} isFirst={i === 0} />
          ))}
        </ul>
      )}
    </div>
  );
};

const ResultRow = ({ clan, isBest, isFirst }: { clan: ClanSummary; isBest: boolean; isFirst: boolean }) => {
  const theme = getTheme();
  const joinType = JOIN_TYPE_LABEL[clan.joinType];
  return (
    <li style={{ borderTop: isFirst ? undefined : `1px solid ${theme.border}`, backgroundColor: isBest ? 'var(--accent-a20)' : undefined }}>
      <Link to={clanPath(clan.tag)} style={{ ...styles.row, padding: isBest ? '14px 12px' : '10px 12px', color: theme.text.primary }}>
        <ClanShield badgeId={clan.badgeId} size={isBest ? 44 : 32} />
        <span style={styles.rowMain}>
          {isBest && <span style={{ ...styles.bestLabel, color: theme.accent }}>Best match</span>}
          <span style={styles.rowName}>
            {clan.name}
            {joinType && <span style={{ ...styles.pill, color: theme.text.secondary, backgroundColor: theme.bg.tertiary }}>{joinType}</span>}
          </span>
          <span style={{ ...styles.rowMeta, color: theme.text.secondary }}>
            <PeopleIcon />
            {clan.members}/{FULL_CLAN}
            {clan.location && ` · ${clan.location}`}
          </span>
        </span>
        <span style={{ ...styles.warChip, backgroundColor: theme.bg.tertiary }} title="War trophies">
          <TrophyIcon />
          <span aria-label={`${formatNumber(clan.warTrophies)} war trophies`}>{formatNumber(clan.warTrophies)}</span>
        </span>
      </Link>
    </li>
  );
};

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const SearchIcon = () => (
  <svg {...iconProps} width="18" height="18" strokeWidth={2.2} style={styles.icon}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const BackIcon = () => (
  <svg {...iconProps} width="16" height="16" strokeWidth={2.2} style={styles.icon}>
    <path d="M15 18 9 12l6-6" />
  </svg>
);

const ChevronIcon = () => (
  <svg {...iconProps} width="16" height="16" style={{ ...styles.icon, marginLeft: 'auto', opacity: 0.6 }}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const PeopleIcon = () => (
  <svg {...iconProps} width="13" height="13" style={styles.icon}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
  </svg>
);

const TrophyIcon = () => (
  <svg {...iconProps} width="13" height="13" style={styles.icon}>
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);

const styles = {
  page: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    maxWidth: '480px',
    margin: '0 auto',
  },
  backLink: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '6px',
    alignSelf: 'flex-start' as const,
    minHeight: '36px',
    marginBottom: '4px',
    fontSize: '13px',
    textDecoration: 'none',
  },
  hero: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    textAlign: 'center' as const,
    margin: '8px 0 18px',
  },
  title: {
    margin: '12px 0 0',
    fontSize: '22px',
    fontWeight: 700 as const,
  },
  tagline: {
    margin: '6px 0 0',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  notice: {
    fontWeight: 600 as const,
  },
  field: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    border: '2px solid',
    borderRadius: '8px',
    padding: '0 14px',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  input: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    padding: '13px 0',
    border: 'none',
    background: 'transparent',
    font: 'inherit',
    fontSize: '16px',
    outline: 'none',
  },
  icon: {
    flexShrink: 0,
  },
  helpButton: {
    alignSelf: 'center' as const,
    marginTop: '10px',
    padding: '8px 10px',
    border: 'none',
    background: 'transparent',
    font: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
  },
  helpText: {
    maxWidth: '390px',
    margin: '2px auto 0',
    fontSize: '13px',
    lineHeight: 1.5,
    textAlign: 'center' as const,
  },
  recent: {
    marginTop: '22px',
  },
  label: {
    margin: '0 2px 8px',
    fontSize: '13px',
    fontWeight: 500 as const,
  },
  chips: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  chip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '7px',
    maxWidth: '100%',
    height: '38px',
    padding: '0 14px 0 9px',
    border: '1px solid',
    borderRadius: '999px',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
  },
  chipName: {
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  results: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
    marginTop: '12px',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    border: '1px solid',
    borderRadius: '12px',
    overflow: 'hidden' as const,
  },
  row: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '11px',
    padding: '10px 12px',
    textDecoration: 'none',
  },
  rowMain: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  bestLabel: {
    fontSize: '11px',
    fontWeight: 600 as const,
  },
  rowName: {
    fontSize: '14px',
    fontWeight: 700 as const,
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  pill: {
    display: 'inline-block' as const,
    marginLeft: '6px',
    padding: '1px 7px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 600 as const,
    verticalAlign: '1px',
  },
  rowMeta: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    fontSize: '12px',
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden' as const,
  },
  warChip: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
    flexShrink: 0,
    padding: '4px 9px',
    borderRadius: '999px',
    fontSize: '12px',
    fontWeight: 700 as const,
    fontVariantNumeric: 'tabular-nums' as const,
    color: 'var(--warn)',
  },
  message: {
    margin: '4px 2px 0',
    fontSize: '14px',
    lineHeight: 1.5,
    textAlign: 'center' as const,
  },
};
