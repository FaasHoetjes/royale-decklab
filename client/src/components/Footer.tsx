import { getTheme } from '../theme';

// The unofficiality notice Supercell's Fan Content Policy requires fan sites
// to display legibly: https://supercell.com/en/fan-content-policy/
export default function Footer() {
  const theme = getTheme();
  return (
    <footer style={{ ...styles.footer, color: theme.text.secondary }}>
      This material is unofficial and is not endorsed by Supercell. For more information see{' '}
      <a
        href="https://supercell.com/en/fan-content-policy/"
        target="_blank"
        rel="noreferrer"
        style={styles.link}
      >
        Supercell's Fan Content Policy
      </a>
      .
    </footer>
  );
}

const styles = {
  footer: {
    padding: '24px 16px 16px',
    fontSize: '12px',
    lineHeight: 1.5,
    textAlign: 'center' as const,
  },
  link: {
    color: 'inherit',
    textDecoration: 'underline' as const,
  },
};
