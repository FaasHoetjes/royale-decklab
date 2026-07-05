// Clash Royale tags use a fixed 14-character alphabet (0289PYLQGRJCUV — no
// vowels or ambiguous glyphs) and run 3–14 characters. Rejecting anything else
// before navigating saves a guaranteed-404 round trip through the backend to
// the rate-limited CR API. The backend enforces the same rule.
const TAG_PATTERN = /^[0289PYLQGRJCUV]{3,14}$/;

/** Strips '#' and whitespace and uppercases — the bare tag body. */
export const normalizeTag = (raw: string): string =>
  raw.replace(/[#\s]/g, '').toUpperCase();

/** True when the input (with or without '#', any case) is a plausible CR tag. */
export const isValidTag = (raw: string): boolean =>
  TAG_PATTERN.test(normalizeTag(raw));
