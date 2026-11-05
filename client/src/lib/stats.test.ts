import { describe, expect, test } from 'bun:test';
import { referrerHost, toolForPath } from './stats';

describe('toolForPath', () => {
  test.each([
    ['/', 'home'],
    ['/2QGG92L9', 'generator'],
    ['/builder', 'builder'],
    ['/upgrades', 'upgrades'],
    ['/best-decks', 'best-decks'],
    ['/faq', 'faq'],
    ['/cards', 'cards'],
    ['/cards/hog-rider', 'card'],
    ['/admin/stats', null],
    ['/admin', null],
    ['/not-a-tag!', null],
    ['/builder/extra', null],
  ])('%s is %p', (path, tool) => expect(toolForPath(path)).toBe(tool as ReturnType<typeof toolForPath>));
});

describe('referrerHost', () => {
  test('keeps only the host of another site', () => {
    expect(referrerHost('https://www.reddit.com/r/ClashRoyale/comments/abc?x=1', 'royaledecklab.com')).toBe('www.reddit.com');
  });
  test('is empty for the site itself, typed-in visits and junk', () => {
    expect(referrerHost('https://royaledecklab.com/faq', 'royaledecklab.com')).toBe('');
    expect(referrerHost('', 'royaledecklab.com')).toBe('');
    expect(referrerHost('not a url', 'royaledecklab.com')).toBe('');
  });
});
