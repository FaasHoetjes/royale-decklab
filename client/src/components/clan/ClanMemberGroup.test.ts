import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import type { ClanWar, ClanWarMember } from '../../api';
import ClanMemberGroup from './ClanMemberGroup';

const members: ClanWarMember[] = Array.from({ length: 50 }, (_, i) => ({
  tag: `#P${i}`, name: `Member ${i}`, role: 'member', lastSeen: null,
  decksUsedToday: 4, decksLeftToday: 0, decksUsedThisWeek: 8, fame: 1000,
  decksUsedPastWeeks: [], famePastWeeks: [],
}));
const war: ClanWar = {
  tag: '#L9VRJ', name: 'Example', badgeId: null, period: 'warDay', day: 2,
  isBattleDay: true, decksLeftToday: 0, membersDoneToday: 50, members,
  race: [], pastWeeks: [], dayEndsAt: null, warStartsAt: null,
};

const render = (startsOpen: boolean) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' },
  createElement(ClanMemberGroup, { id: 'done', title: 'Done', color: 'var(--up)', members, war, youTag: null, startsOpen, isMobile: false })
));

describe('clan member group rendering', () => {
  test('a folded group keeps its count without mounting member rows', () => {
    const html = render(false);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('50');
    expect(html).not.toContain('<li');
    expect(html).not.toContain('Member 0');
  });

  test('an expanded group renders all member rows', () => {
    const html = render(true);
    expect(html).toContain('aria-expanded="true"');
    expect((html.match(/<li /g) ?? []).length).toBe(50);
    expect(html).toContain('Member 49');
  });
});
