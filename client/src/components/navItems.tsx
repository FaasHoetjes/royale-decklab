import type { ReactNode } from 'react';
import { ZapIcon, GridIcon, TrophyIcon, TrendingUpIcon, HelpIcon } from './navIcons';

export interface NavItem {
  to: string;
  /** The page's full name, for the sidebar and the phone's top bar. */
  label: string;
  /** A shorter label for the phone's tab bar. */
  tab: string;
  end: boolean;
  icon: ReactNode;
}

/** The four tools; the sidebar adds FAQ after them, and the phone keeps FAQ in its sheet. */
export function toolItems(activePlayerTag: string | null): NavItem[] {
  const generatorTo = activePlayerTag ? `/${activePlayerTag.replace('#', '')}` : '/';
  return [
    { to: generatorTo, label: 'War Deck Generator', tab: 'Generator', end: true, icon: <ZapIcon /> },
    { to: '/best-decks', label: 'Best War Decks', tab: 'Best decks', end: false, icon: <TrophyIcon /> },
    { to: '/builder', label: 'War Deck Builder', tab: 'Builder', end: false, icon: <GridIcon /> },
    { to: '/upgrades', label: 'Upgrade Advisor', tab: 'Upgrades', end: false, icon: <TrendingUpIcon /> },
  ];
}

export const FAQ_ITEM: NavItem = { to: '/faq', label: 'FAQ', tab: 'FAQ', end: false, icon: <HelpIcon /> };

export function pageTitle(pathname: string, items: NavItem[]): string | undefined {
  return [...items, FAQ_ITEM].find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)))?.label;
}
