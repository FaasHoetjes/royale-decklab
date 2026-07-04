import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useApp } from '../AppContext';
import { playerWarDecksOptions } from '../queries';
import { getTheme } from '../theme';
import { useIsMobile } from '../hooks/useIsMobile';

export default function Landing() {
  const { isDarkMode, setActivePlayerTag } = useApp();
  const theme = getTheme(isDarkMode);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const [loading, setLoading] = useState(false);

  // The '#' is shown as a fixed prefix, so strip it (and stray whitespace)
  // from whatever the user types or pastes.
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

    // Validate the tag here rather than navigating optimistically: a bad tag
    // used to land the user on the generator page with an error toast. Instead
    // fetch the player's war decks first — on success we've also warmed the
    // cache, so the generator paints instantly; on failure we stay put and show
    // the message inline.
    const tag = `#${code}`;
    setLoading(true);
    try {
      await queryClient.fetchQuery(playerWarDecksOptions(tag));
      setActivePlayerTag(tag);
      navigate(`/${code}`);
    } catch {
      setError('Couldn\'t load that player. Check your tag or try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <div style={{ ...styles.brand, color: theme.text.primary }}>
          <div style={{ ...styles.brandTop, fontSize: isMobile ? '36px' : '48px' }}>ROYALE</div>
          <div style={{ ...styles.brandBottom, fontSize: isMobile ? '48px' : '64px' }}>DECKLAB</div>
        </div>

        <p style={{ ...styles.tagline, color: theme.text.secondary }}>
          Enter your player tag to build and generate your best war decks.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div
            style={{
              ...styles.field,
              backgroundColor: theme.bg.secondary,
              borderColor: focused ? theme.accent : theme.border,
              boxShadow: focused ? `0 0 0 3px ${theme.accent}33` : 'none',
            }}
          >
            <span style={{ ...styles.prefix, color: theme.text.secondary }}>#</span>
            <input
              type="text"
              placeholder="YOUR PLAYER TAG"
              value={value}
              onChange={handleChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={loading}
              autoFocus
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
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    minHeight: '100vh',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: '20px',
  },
  hero: {
    width: '100%',
    maxWidth: '460px',
    textAlign: 'center' as const,
  },
  brand: {
    display: 'inline-block' as const,
    lineHeight: 1.0,
    marginBottom: '20px',
  },
  brandTop: {
    fontSize: '48px',
    fontWeight: 700 as const,
    letterSpacing: '3px',
    textAlign: 'right' as const,
  },
  brandBottom: {
    fontSize: '64px',
    fontWeight: 800 as const,
    letterSpacing: '2px',
  },
  tagline: {
    fontSize: '16px',
    marginBottom: '36px',
  },
  form: {
    display: 'flex' as const,
    gap: '10px',
  },
  field: {
    flex: 1,
    display: 'flex' as const,
    alignItems: 'center' as const,
    border: '2px solid #ddd',
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
    padding: '14px 28px',
    fontSize: '16px',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 700 as const,
    transition: 'all 0.2s ease',
  },
  error: {
    color: '#ff6b6b',
    marginTop: '16px',
    fontSize: '14px',
  },
};
