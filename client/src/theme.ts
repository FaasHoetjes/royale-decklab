// The theme object components style against. The actual color values live as CSS
// custom properties in index.css (light on :root, dark on :root[data-theme]);
// these are just the var(--x) references, identical in both modes. That's what
// makes a light/dark toggle a single native repaint (flip data-theme on <html>)
// rather than React re-computing and re-applying inline styles across the tree.
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
