import { describe, expect, test } from 'bun:test';
import { sidebarItems, toolItems } from './navItems';

describe('sidebarItems', () => {
  test('an unlisted page stays out of the sidebar but keeps its title', () => {
    const unlisted = toolItems(null).filter((item) => item.unlisted).map((item) => item.to);

    expect(unlisted).toContain('/crown-series');
    expect(unlisted).toContain('/ladder');
    expect(sidebarItems(null).map((item) => item.to)).not.toContain('/crown-series');
    expect(sidebarItems(null).map((item) => item.to)).toContain('/faq');
  });
});
