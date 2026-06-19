export const getTheme = (isDark: boolean) => ({
  bg: {
    primary: isDark ? '#0e0e0e' : '#f0f2f5',
    secondary: isDark ? '#161616' : '#ffffff',
    tertiary: isDark ? '#1e1e1e' : '#f8f9ff',
  },
  text: {
    primary: isDark ? '#ffffff' : '#000000',
    secondary: isDark ? '#cccccc' : '#666666',
  },
  border: isDark ? '#2c2c2c' : '#e0e0e0',
  accent: isDark ? '#4a9eff' : '#007bff',
  control: {
    bg: isDark ? '#0e0e0e' : '#ffffff',
    text: isDark ? '#ffffff' : '#1a1a1a',
    border: isDark ? '#2c2c2c' : '#d0d0d0',
  },
});

export type Theme = ReturnType<typeof getTheme>;
