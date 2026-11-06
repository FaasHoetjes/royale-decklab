import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { track, trackDeckExport } from './stats';

describe('export tracking', () => {
  const globals = ['window', 'document', 'localStorage', 'fetch'] as const;
  let originals: (PropertyDescriptor | undefined)[];
  let excluded: boolean;
  let pathname: string;
  let requests: Record<string, unknown>[];

  beforeEach(() => {
    originals = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key));
    excluded = false;
    pathname = '/builder';
    requests = [];
    const values = [
      { location: { get pathname() { return pathname; }, host: 'royaledecklab.com' } },
      { referrer: 'https://www.reddit.com/r/ClashRoyale' },
      { getItem: () => excluded ? '1' : null },
      mock((_url: string, init: RequestInit) => {
        requests.push(JSON.parse(init.body as string));
        expect(init.keepalive).toBe(true);
        return Promise.resolve(new Response(null, { status: 204 }));
      }),
    ];
    globals.forEach((key, index) => Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: values[index] }));
  });

  afterEach(() => {
    globals.forEach((key, index) => {
      const original = originals[index];
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  });

  test('counts repeat exports while still deduplicating page visits', () => {
    track({ kind: 'tool', tool: 'builder' });
    track({ kind: 'tool', tool: 'builder' });
    trackDeckExport('deck_copy');
    trackDeckExport('deck_copy');
    trackDeckExport('deck_open');
    expect(requests.map((r) => r.kind)).toEqual(['tool', 'deck_copy', 'deck_copy', 'deck_open']);
    expect(requests[1]).toEqual({ kind: 'deck_copy', tool: 'builder', ref: 'www.reddit.com' });
  });

  test.each([
    ['/YPP2RJ92C', 'generator'],
    ['/best-decks', 'best-decks'],
    ['/upgrades', 'upgrades'],
  ])('attributes %s to %s without sending the URL or player tag', (path, tool) => {
    pathname = path;
    trackDeckExport('deck_open');
    expect(requests).toEqual([{ kind: 'deck_open', tool, ref: 'www.reddit.com' }]);
  });

  test('respects the excluded admin browser', () => {
    excluded = true;
    trackDeckExport('deck_open');
    trackDeckExport('deck_copy');
    expect(requests).toEqual([]);
  });

  test('ignores pages without deck exports', () => {
    pathname = '/admin/stats';
    trackDeckExport('deck_copy');
    expect(requests).toEqual([]);
  });
});
