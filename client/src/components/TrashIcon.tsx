/**
 * Trashcan glyph for the builder's "clear deck(s)" buttons. Inline SVG in
 * currentColor (like the other control icons) so it follows the theme, unlike
 * the 🗑 emoji which keeps its own colors and varies per platform.
 */
export default function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }} aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  );
}
