import { useState } from 'react';
import { getTheme } from '../../theme';

const HEIGHT_PER_WIDTH = 126 / 106;

interface ClanShieldProps {
  badgeId: number | null;
  size: number;
}

/** A clan's in-game shield, served from /badges; a dashed outline stands in for a missing or unknown one. */
const ClanShield = ({ badgeId, size }: ClanShieldProps) => {
  const [failedId, setFailedId] = useState<number | null>(null);
  const height = Math.round(size * HEIGHT_PER_WIDTH);

  if (badgeId == null || failedId === badgeId) return <EmptyShield size={size} />;
  return (
    <img
      src={`/badges/${badgeId}.webp`}
      alt=""
      width={size}
      height={height}
      loading="lazy"
      decoding="async"
      onError={() => setFailedId(badgeId)}
      style={styles.shield}
    />
  );
};

export default ClanShield;

export const EmptyShield = ({ size, mark = false }: { size: number; mark?: boolean }) => {
  const theme = getTheme();
  return (
    <svg
      width={size}
      height={Math.round(size * HEIGHT_PER_WIDTH)}
      viewBox="0 0 106 126"
      aria-hidden="true"
      style={{ ...styles.shield, color: theme.text.tertiary }}
    >
      <path
        d="M53 5 98 27v44c0 24-19 42-45 50C27 113 8 95 8 71V27Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeDasharray="10 9"
      />
      {mark && (
        <text x="53" y="80" textAnchor="middle" fontSize="42" fontWeight="700" fill="currentColor">
          ?
        </text>
      )}
    </svg>
  );
};

const styles = {
  shield: {
    display: 'block' as const,
    flexShrink: 0,
  },
};
