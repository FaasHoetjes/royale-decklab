import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../AppContext';
import { playerWarDecksOptions, useMetaStatus } from '../queries';
import { startingQuery } from '../lib/generatorOptions';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';
import { isValidTag, normalizeTag } from '../lib/playerTag';
import { timeAgo } from '../lib/timeAgo';
import CardWall from '../components/CardWall';

export default function Landing() {
  const { setActivePlayerTag } = useApp();
  const theme = getTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const status = useMetaStatus();

  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const linkState = (useLocation().state ?? null) as { tagError?: string; badTag?: string } | null;
  useEffect(() => {
    if (linkState?.tagError) {
      setError(linkState.tagError);
      if (linkState.badTag) setValue(normalizeTag(linkState.badTag));
    }
  }, [linkState]);
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showTagHelp, setShowTagHelp] = useState(false);

  const lastPrefetched = useRef('');
  useEffect(() => {
    const code = value.trim();
    if (code.length < 8 || !isValidTag(code) || lastPrefetched.current === code) return;
    const timer = setTimeout(() => {
      lastPrefetched.current = code;
      queryClient.prefetchQuery({ ...playerWarDecksOptions(`#${code}`, startingQuery()), retry: false });
    }, 500);
    return () => clearTimeout(timer);
  }, [value, queryClient]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value.replace(/[#\s]/g, '').toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const code = value.trim();
    if (!code) {
      setError('Please enter your player tag');
      return;
    }
    if (!isValidTag(code)) {
      setError("That doesn't look like a valid player tag; check it on your in-game profile.");
      return;
    }

    const tag = `#${code}`;
    setLoading(true);
    try {
      await queryClient.fetchQuery(playerWarDecksOptions(tag, startingQuery()));
      setActivePlayerTag(tag);
      navigate(`/${code}`);
    } catch {
      setError('Couldn\'t load that player. Check your tag or try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ ...styles.page, minHeight: isMobile ? 'calc(100dvh - 260px)' : 'calc(100dvh - 120px)' }}>
      <CardWall isMobile={isMobile} />
      <section style={styles.hero}>
        <h1 aria-label="Royale DeckLab" style={{ ...styles.wordmark, color: theme.text.primary }}>
          <span style={{ ...styles.wordmarkTop, fontSize: isMobile ? '34px' : '46px' }}>ROYALE</span>
          <span style={{ ...styles.wordmarkBottom, fontSize: isMobile ? '46px' : '62px' }}>DECKLAB</span>
        </h1>
        <p style={{ ...styles.tagline, fontSize: isMobile ? '15px' : '17px', color: theme.text.secondary }}>
          Your best four war decks, from the cards you own.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div
            style={{
              ...styles.field,
              backgroundColor: theme.bg.secondary,
              borderColor: focused ? theme.accent : theme.border,
              boxShadow: focused ? '0 0 0 3px var(--accent-a20)' : 'none',
            }}
          >
            <span style={{ ...styles.prefix, color: theme.text.secondary }}>#</span>
            <input
              type="text"
              placeholder="YOUR PLAYER TAG"
              aria-label="Your player tag"
              value={value}
              onChange={handleChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={loading}
              autoFocus={!isMobile}
              spellCheck={false}
              autoCapitalize="characters"
              style={{ ...styles.input, color: theme.text.primary }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              backgroundColor: theme.accent,
              color: theme.onAccent,
              opacity: loading ? 0.7 : 1,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Checking…' : 'Continue'}
          </button>
        </form>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.links}>
          <button
            type="button"
            className="mobile-touch-target"
            onClick={() => setShowTagHelp((show) => !show)}
            aria-expanded={showTagHelp}
            aria-controls="player-tag-help"
            style={{ ...styles.textButton, color: theme.accent }}
          >
            Where's my player tag?
          </button>
        </div>
        {showTagHelp && (
          <p id="player-tag-help" style={{ ...styles.helpText, color: theme.text.secondary }}>
            Open your Clash Royale profile by tapping your name on the home screen. Your player
            tag appears below your name and starts with #. Tap the tag, choose <strong>Copy Tag</strong>,
            then paste it here. Decklab accepts it with or without the #.
          </p>
        )}

        {status.data && status.data.deckCount > 0 && (
          <p style={{ ...styles.status, color: theme.text.secondary }}>
            <span style={{ ...styles.statusDot, backgroundColor: theme.accent }} aria-hidden="true" />
            {status.data.deckCount.toLocaleString('en-US')} war decks tracked · updated{' '}
            {timeAgo(status.data.lastRefresh)}
          </p>
        )}
      </section>
    </div>
  );
}

const styles = {
  page: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  hero: {
    position: 'relative' as const,
    width: '100%',
    maxWidth: '480px',
    textAlign: 'center' as const,
  },
  wordmark: {
    display: 'inline-flex' as const,
    flexDirection: 'column' as const,
    margin: 0,
    lineHeight: 1,
  },
  wordmarkTop: {
    fontWeight: 700 as const,
    letterSpacing: '3px',
    textAlign: 'right' as const,
  },
  wordmarkBottom: {
    fontWeight: 800 as const,
    letterSpacing: '2px',
  },
  tagline: {
    margin: '18px 0 26px',
    lineHeight: 1.5,
    textWrap: 'pretty' as const,
  },
  form: {
    display: 'flex' as const,
    gap: '10px',
  },
  field: {
    flex: 1,
    minWidth: 0,
    display: 'flex' as const,
    alignItems: 'center' as const,
    border: '2px solid',
    borderRadius: '8px',
    paddingLeft: '16px',
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  prefix: {
    fontSize: '18px',
    fontWeight: 700 as const,
    fontFamily: 'monospace',
    userSelect: 'none' as const,
  },
  input: {
    flex: 1,
    width: '100%',
    minWidth: 0,
    padding: '14px 16px 14px 6px',
    fontSize: '16px',
    fontWeight: 600 as const,
    letterSpacing: '1px',
    border: 'none',
    background: 'transparent',
    fontFamily: 'monospace',
    outline: 'none',
  },
  button: {
    padding: '14px 24px',
    fontSize: '16px',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700 as const,
    transition: 'all 0.2s ease',
  },
  links: {
    display: 'flex' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: '2px 4px',
    marginTop: '10px',
  },
  textButton: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '8px 10px',
    border: 'none',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600 as const,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  helpText: {
    maxWidth: '390px',
    margin: '2px auto 0',
    fontSize: '13px',
    lineHeight: 1.5,
  },
  status: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '8px',
    margin: '18px 0 0',
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums' as const,
  },
  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  error: {
    color: '#ff6b6b',
    margin: '14px 0 0',
    fontSize: '14px',
  },
};
