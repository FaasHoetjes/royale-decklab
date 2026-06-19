export const getTheme = (isDark: boolean) => ({
  bg: {
    // A deliberate surface ladder so elevation reads at a glance: each level is
    // a clear step away from the page, instead of three near-identical greys.
    primary: isDark ? '#0c0c0d' : '#f0f2f5', // page background (lowest)
    secondary: isDark ? '#161618' : '#ffffff', // raised panels: sidebar, hero, deck cards
    tertiary: isDark ? '#202023' : '#f8f9ff', // inset wells / nested surfaces
    elevated: isDark ? '#26262a' : '#ffffff', // interactive surfaces sitting on top
  },
  text: {
    // Three roles: primary reads as the content, secondary as labels, tertiary
    // as the faintest metadata. Softened off-white in dark mode reads cleaner
    // than pure #fff against near-black.
    primary: isDark ? '#f4f4f5' : '#000000',
    secondary: isDark ? '#a1a1aa' : '#666666',
    tertiary: isDark ? '#71717a' : '#9aa0ab',
  },
  border: isDark ? '#2a2a2e' : '#e0e0e0',
  borderStrong: isDark ? '#3a3a40' : '#cdd3df',
  // The single accent: blue in light mode, gold in dark mode. It is a FILL color
  // — always pair it with `onAccent` for legible text, never white-on-gold.
  accent: isDark ? '#e8b24a' : '#007bff',
  accentBright: isDark ? '#f3c468' : '#3393ff',
  onAccent: isDark ? '#1a1407' : '#ffffff',
  control: {
    bg: isDark ? '#161618' : '#ffffff',
    text: isDark ? '#f4f4f5' : '#1a1a1a',
    border: isDark ? '#2a2a2e' : '#d0d0d0',
  },
});

export type Theme = ReturnType<typeof getTheme>;
