export const getTheme = (isDark: boolean) => ({
  bg: {
    primary: isDark ? '#1a1a1a' : '#f0f2f5',
    secondary: isDark ? '#2a2a2a' : '#ffffff',
    tertiary: isDark ? '#333333' : '#f8f9ff',
  },
  text: {
    primary: isDark ? '#ffffff' : '#000000',
    secondary: isDark ? '#cccccc' : '#666666',
  },
  border: isDark ? '#444444' : '#e0e0e0',
  accent: isDark ? '#4a9eff' : '#007bff',
  control: {
    bg: isDark ? '#1a1a1a' : '#ffffff',
    text: isDark ? '#ffffff' : '#1a1a1a',
    border: isDark ? '#444444' : '#d0d0d0',
  },
});

export type Theme = ReturnType<typeof getTheme>;
