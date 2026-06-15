import { useState } from 'react';

interface PlayerSearchProps {
  onSearch: (playerTag: string) => void;
  isLoading: boolean;
  isDarkMode: boolean;
}

export default function PlayerSearch({ onSearch, isLoading, isDarkMode }: PlayerSearchProps) {
  const [playerTag, setPlayerTag] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const tag = playerTag.trim();
    if (!tag) {
      setError('Please enter a player tag');
      return;
    }

    if (!tag.startsWith('#')) {
      setError('Player tag must start with #');
      return;
    }

    onSearch(tag);
  };

  const theme = {
    textSecondary: isDarkMode ? '#cccccc' : '#666',
    inputBg: isDarkMode ? '#2a2a2a' : '#ffffff',
    inputBorder: isDarkMode ? '#444444' : '#ddd',
    inputText: isDarkMode ? '#ffffff' : '#000000',
    buttonBg: isDarkMode ? '#4a9eff' : '#007bff',
  };

  return (
    <div style={styles.container}>
      <h1>Royale DeckLab</h1>
      <p style={{ ...styles.subtitle, color: theme.textSecondary }}>Find your best 4 war decks</p>

      <form onSubmit={handleSubmit} style={styles.form}>
        <input
          type="text"
          placeholder="Enter player tag (e.g., #2QGG92L9)"
          value={playerTag}
          onChange={(e) => setPlayerTag(e.target.value)}
          disabled={isLoading}
          style={{
            ...styles.input,
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.inputText,
          }}
        />
        <button type="submit" disabled={isLoading} style={{ ...styles.button, backgroundColor: theme.buttonBg }}>
          {isLoading ? 'Loading...' : 'Search'}
        </button>
      </form>

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
}

const styles = {
  container: {
    textAlign: 'center' as const,
    padding: '40px 20px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  subtitle: {
    color: '#666',
    fontSize: '16px',
    marginBottom: '30px',
  },
  form: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  input: {
    flex: 1,
    padding: '12px',
    fontSize: '16px',
    border: '2px solid #ddd',
    borderRadius: '4px',
    fontFamily: 'monospace',
  },
  button: {
    padding: '12px 24px',
    fontSize: '16px',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  error: {
    color: '#d32f2f',
    marginTop: '10px',
  },
};
