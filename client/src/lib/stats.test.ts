import { describe, expect, test } from 'bun:test';
import { referrerHost, takeCampaign, toolForPath } from './stats';

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

describe('takeCampaign', () => {
  test('reads the utm tags and removes only them from the address bar', () => {
    let replaced = '';
    const campaign = takeCampaign(
      { href: 'https://royaledecklab.com/2QGG92L9?share=a.b&utm_source=reddit&utm_campaign=update-post&utm_medium=social#x' },
      (url) => (replaced = url),
    );
    expect(campaign).toEqual({ utmSource: 'reddit', utmCampaign: 'update-post' });
    expect(replaced).toBe('/2QGG92L9?share=a.b#x');
  });
  test('leaves a normal address alone', () => {
    let replaced: string | null = null;
    expect(takeCampaign({ href: 'https://royaledecklab.com/faq?x=1' }, (url) => (replaced = url))).toEqual({});
    expect(replaced).toBeNull();
  });
});
