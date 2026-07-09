// Values are var(--x) refs into index.css; flipping data-theme repaints
// natively instead of React re-computing styles across the tree.
export const getTheme = () => ({
  bg: {
    primary: 'var(--bg-primary)',
    secondary: 'var(--bg-secondary)',
    tertiary: 'var(--bg-tertiary)',
    elevated: 'var(--bg-elevated)',
  },
  text: {
    primary: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    tertiary: 'var(--text-tertiary)',
  },
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  accent: 'var(--accent)',
  accentBright: 'var(--accent-bright)',
  onAccent: 'var(--on-accent)',
  control: {
    bg: 'var(--control-bg)',
    text: 'var(--control-text)',
    border: 'var(--control-border)',
  },
});

export type Theme = ReturnType<typeof getTheme>;
