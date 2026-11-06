import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { getTheme } from '../../theme';
import { isValidTag, normalizeTag } from '../../lib/playerTag';

interface ClanSearchProps {
  /** Shown above the form, e.g. why the active player's clan couldn't be opened. */
  notice?: string;
}

const ClanSearch = ({ notice }: ClanSearchProps) => {
  const theme = getTheme();
  const navigate = useNavigate();
  const [clanTag, setClanTag] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const tag = normalizeTag(clanTag);
    if (!tag) {
      setError('Please enter a clan tag');
      return;
    }
    if (!isValidTag(tag)) {
      setError("That doesn't look like a valid clan tag. Check it on your clan's profile.");
      return;
    }
    navigate(`/clan/${tag}`);
  };

  return (
    <div style={{ ...styles.panel, borderColor: theme.border, backgroundColor: theme.bg.secondary }}>
      {notice && <p style={{ ...styles.notice, color: theme.text.primary }}>{notice}</p>}
      <p style={{ ...styles.text, color: theme.text.secondary }}>
        Enter a clan tag to see who still has war decks to play today.
      </p>
      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          aria-label="Clan tag"
          placeholder="Clan tag (e.g., #L9VRJ)"
          value={clanTag}
          onChange={(e) => setClanTag(e.target.value)}
          style={{
            ...styles.input,
            backgroundColor: theme.control.bg,
            borderColor: theme.control.border,
            color: theme.control.text,
          }}
        />
        <button type="submit" style={{ ...styles.button, backgroundColor: theme.text.primary, color: theme.bg.primary }}>
          Open clan
        </button>
      </form>
      {error && (
        <p role="alert" style={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
};

export default ClanSearch;

const styles = {
  panel: {
    border: '1px solid',
    borderRadius: '12px',
    padding: '24px',
  },
  notice: {
    fontSize: '16px',
    fontWeight: 700 as const,
    margin: '0 0 6px',
  },
  text: {
    fontSize: '15px',
    lineHeight: 1.6,
    margin: '0 0 16px',
  },
  form: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '10px',
  },
  input: {
    flex: '1 1 200px',
    minWidth: 0,
    padding: '11px 12px',
    fontSize: '16px',
    border: '1px solid',
    borderRadius: '8px',
    fontFamily: 'monospace',
  },
  button: {
    padding: '11px 22px',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
  },
  error: {
    color: 'var(--down)',
    fontSize: '14px',
    margin: '10px 0 0',
  },
};
