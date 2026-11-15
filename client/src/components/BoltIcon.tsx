import type { CSSProperties } from 'react';

export default function BoltIcon({ size = 14, style }: { size?: number | string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      <path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6L13.5 2Z" />
    </svg>
  );
}
