import { describe, expect, test } from 'bun:test';
import { decodeShare, encodeShare } from './shareLink';

const lineup = [
  [26000000, 26000010, 26000030, 27000006, 27000010, 28000009, 28000010, 28000015],
  [26000024, 26000044, 26000050, 26000061, 26000077, 26000084, 28000007, 28000011],
];

describe('share links', () => {
  test('a lineup survives the round trip in order, two characters a card', () => {
    const code = encodeShare(lineup)!;
    expect(code).toHaveLength(2 * 16 + 1);
    expect(code).toMatch(/^[0-9a-z.]+$/);
    expect(decodeShare(code)).toEqual(lineup);
  });

  test('a card outside the compact range gives no code', () => {
    expect(encodeShare([[159000000, ...lineup[0]!.slice(1)]])).toBeNull();
    expect(encodeShare([[26000500, ...lineup[0]!.slice(1)]])).toBeNull();
  });

  test('cut-off, hand-edited or impossible links are rejected', () => {
    const code = encodeShare(lineup)!;
    expect(decodeShare(null)).toBeNull();
    expect(decodeShare(code.slice(0, -1))).toBeNull();
    expect(decodeShare(code.toUpperCase())).toBeNull();
    expect(decodeShare(`${code}.${code}`)).toBeNull();
    expect(decodeShare(`${code.slice(0, 16)}.${code.slice(0, 16)}`)).toBeNull();
    expect(decodeShare('zz'.repeat(8))).toBeNull();
  });
});
