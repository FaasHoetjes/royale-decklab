import { beforeEach, describe, expect, test } from 'bun:test';
import { loadRecentClans, parseClanQuery, recentClansToShow, rememberClan, type ClanRef } from './recentClans';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

const clan = (tag: string, badgeId: number | null = 16000000): ClanRef => ({ tag, name: `Clan ${tag}`, badgeId });

describe('recent clans', () => {
  beforeEach(() => store.clear());

  test('keep the newest first without repeats', () => {
    rememberClan(clan('#A'));
    rememberClan(clan('#B'));
    rememberClan(clan('#A'));

    expect(loadRecentClans().map((c) => c.tag)).toEqual(['#A', '#B']);
  });

  test('keep five at most', () => {
    for (const tag of ['#1', '#2', '#3', '#4', '#5', '#6']) rememberClan(clan(tag));

    expect(loadRecentClans().map((c) => c.tag)).toEqual(['#6', '#5', '#4', '#3', '#2']);
  });

  test('skip broken entries and broken storage', () => {
    store.set('recentClans', JSON.stringify([clan('#A', null), { tag: '#B' }, null]));
    expect(loadRecentClans()).toEqual([clan('#A', null)]);

    store.set('recentClans', '{not json');
    expect(loadRecentClans()).toEqual([]);
  });

  test("show three, leaving out the clan the back link leads to", () => {
    const clans = ['#A', '#OWN', '#B', '#C', '#D'].map((tag) => clan(tag));

    expect(recentClansToShow(clans, '#OWN').map((c) => c.tag)).toEqual(['#A', '#B', '#C']);
  });
});

describe('parseClanQuery', () => {
  test('searches a name from three characters', () => {
    expect(parseClanQuery('du')).toEqual({ name: null, tag: null });
    expect(parseClanQuery(' dutch ')).toEqual({ name: 'dutch', tag: null });
  });

  test('opens a tag written with #, without searching it', () => {
    expect(parseClanQuery('#2q92cg9')).toEqual({ name: null, tag: '2Q92CG9' });
    expect(parseClanQuery('#dutch')).toEqual({ name: null, tag: null });
  });

  test('both searches and offers a name spelled in tag letters', () => {
    expect(parseClanQuery('lucy')).toEqual({ name: 'lucy', tag: 'LUCY' });
  });
});
