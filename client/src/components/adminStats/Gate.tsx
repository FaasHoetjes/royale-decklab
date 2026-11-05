import { useState, type FormEvent, type ReactNode } from 'react';
import { getTheme } from '../../theme';
import { statsStyles } from './styles';

export function Gate({ children }: { children: ReactNode }) {
  const theme = getTheme();
  return (
    <div style={styles.gate}>
      <h1 style={{ ...statsStyles.title, color: theme.text.primary }}>Stats</h1>
      {children}
    </div>
  );
}

export function TokenForm({ wrongToken, onSubmit }: { wrongToken: boolean; onSubmit: (token: string) => void }) {
  const theme = getTheme();
  const [draft, setDraft] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onSubmit(value);
    setDraft('');
  };

  return (
    <form onSubmit={submit} style={{ ...statsStyles.panel, ...styles.form }}>
      <label htmlFor="admin-token" style={{ color: theme.text.secondary }}>Admin token</label>
      <input
        id="admin-token"
        type="password"
        autoComplete="current-password"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ ...styles.input, backgroundColor: theme.control.bg, color: theme.control.text, borderColor: theme.control.border }}
      />
      <button type="submit" style={{ ...statsStyles.button, backgroundColor: theme.accent, color: theme.onAccent }}>
        Show stats
      </button>
      {wrongToken && <p style={{ ...statsStyles.note, color: theme.text.secondary }}>That token wasn't accepted.</p>}
    </form>
  );
}

const styles = {
  gate: {
    maxWidth: '400px',
    margin: '0 auto',
    padding: '80px 16px 48px',
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    gap: '16px',
    textAlign: 'center' as const,
  },
  form: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'left' as const,
  },
  input: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid',
    fontSize: '16px',
  },
};
