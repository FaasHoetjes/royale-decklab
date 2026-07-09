// CR tags use a fixed 14-char alphabet (0289PYLQGRJCUV); rejecting anything else
// here avoids a guaranteed-404 round trip to the rate-limited CR API.
const TAG_PATTERN = /^[0289PYLQGRJCUV]{3,14}$/;

export const normalizeTag = (raw: string): string =>
  raw.replace(/[#\s]/g, '').toUpperCase();

export const isValidTag = (raw: string): boolean =>
  TAG_PATTERN.test(normalizeTag(raw));
