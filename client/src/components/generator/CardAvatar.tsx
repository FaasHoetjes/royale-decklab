import type { CSSProperties } from 'react';
import type { BuilderCard } from '../../lib/builderCards';
import { cardIconUrl } from '../../lib/cardDisplay';

export default function CardAvatar({ card, dim, small, style }: { card: BuilderCard | undefined; dim?: boolean; small?: boolean; style?: CSSProperties }) {
  const size = small ? '24px' : '28px';
  if (!card) return <span style={{ ...styles.avatar, width: size, height: size, backgroundColor: 'var(--bg-tertiary)', ...style }} />;
  return (
    <img
      src={cardIconUrl(card.iconUrls, 'normal')}
      alt=""
      style={{ ...styles.avatar, width: size, height: size, filter: dim ? 'grayscale(1) brightness(0.8)' : undefined, ...style }}
    />
  );
}

const styles = {
  avatar: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    objectFit: 'cover' as const,
    objectPosition: 'top',
  },
};
