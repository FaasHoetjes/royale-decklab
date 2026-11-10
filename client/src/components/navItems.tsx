import type { ReactNode } from 'react';
import { ZapIcon, GridIcon, TrophyIcon, CardsIcon, TrendingUpIcon, ShieldIcon, HelpIcon } from './navIcons';

export interface NavItem {
  to: string;
  /** The page's full name, for the sidebar and the phone's top bar. */
  label: string;
  /** A shorter label for the phone's tab bar. */
  tab: string;
  /** The browser tab's and search result's title, worded the way people search; defaults to the label. */
  title?: string;
  /** The page's meta description, for search results. */
  description: string;
  end: boolean;
  icon: ReactNode;
}

/** The generator is home: the player's own page, or the landing page until a player is picked. */
export function homePath(activePlayerTag: string | null): string {
  return activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';
}

export const SITE_NAME = 'Royale DeckLab';
const SITE_DESCRIPTION = 'Generate your best four Clash Royale War Decks tuned to the cards you actually own.';

/** The tools; the sidebar adds FAQ after them, and the phone keeps FAQ in its sheet. */
export function toolItems(activePlayerTag: string | null): NavItem[] {
  return [
    {
      to: homePath(activePlayerTag),
      label: 'War Deck Generator',
      tab: 'Generator',
      description: SITE_DESCRIPTION,
      end: true,
      icon: <ZapIcon />,
    },
    {
      to: '/best-decks',
      label: 'Best War Decks',
      tab: 'Best decks',
      title: `Best Clash Royale War Decks (${new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })})`,
      description: 'The strongest four-deck Clash Royale war sets right now, ranked on Clan War battles from the top 100 war clans.',
      end: false,
      icon: <TrophyIcon />,
    },
    {
      to: '/cards',
      label: 'Cards',
      tab: 'Cards',
      title: 'Clash Royale Card Win Rates in Clan War',
      description: 'How every Clash Royale card does in Clan War right now: win rate, play rate, the change since the last balance update and its best war decks.',
      end: false,
      icon: <CardsIcon />,
    },
    {
      to: '/builder',
      label: 'War Deck Builder',
      tab: 'Builder',
      title: 'Clash Royale War Deck Builder',
      description: 'Build four Clash Royale war decks with no shared cards and see how each one scores in the current war meta.',
      end: false,
      icon: <GridIcon />,
    },
    {
      to: '/upgrades',
      label: 'Upgrade Advisor',
      tab: 'Upgrades',
      title: 'What to Upgrade Next in Clash Royale',
      description: 'Find the card upgrade that raises your Clash Royale war lineup the most.',
      end: false,
      icon: <TrendingUpIcon />,
    },
    {
      to: '/clan',
      label: 'Clan War Planner',
      tab: 'Clan',
      title: 'Clash Royale Clan War Planner',
      description: 'See who in your Clash Royale clan still has war decks to play today, and give every member their best four war decks.',
      end: false,
      icon: <ShieldIcon />,
    },
  ];
}

export const FAQ_ITEM: NavItem = {
  to: '/faq',
  label: 'FAQ',
  tab: 'FAQ',
  title: 'Clash Royale War Deck FAQ',
  description: 'How Royale DeckLab picks and scores Clash Royale war decks, and where its data comes from.',
  end: false,
  icon: <HelpIcon />,
};

function pageItem(pathname: string, items: NavItem[]): NavItem | undefined {
  return [...items, FAQ_ITEM].find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
}

export function pageTitle(pathname: string, items: NavItem[]): string | undefined {
  return pageItem(pathname, items)?.label;
}

/** The browser tab's title and the search-result description for a page; the landing page gets the site's own. */
export function documentMeta(pathname: string, items: NavItem[], isPlayerPage: boolean): { title: string; description: string } {
  if (pathname === '/') return { title: `${SITE_NAME}: your best Clash Royale war decks`, description: SITE_DESCRIPTION };
  const item = pageItem(pathname, items) ?? (isPlayerPage ? items[0] : undefined);
  return item
    ? { title: `${item.title ?? item.label} · ${SITE_NAME}`, description: item.description }
    : { title: SITE_NAME, description: SITE_DESCRIPTION };
}
