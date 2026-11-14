import { isValidTag } from './playerTag';

// Share loaders with React.lazy so intent preloads warm the same route chunks.
export const pageLoaders = {
  generator: () => import('../pages/WarDeckGenerator'),
  builder: () => import('../pages/WarDeckBuilder'),
  faq: () => import('../pages/Faq'),
  bestDecks: () => import('../pages/BestWarDecks'),
  upgrades: () => import('../pages/UpgradeAdvisor'),
  cards: () => import('../pages/Cards'),
  cardPage: () => import('../pages/CardPage'),
  clan: () => import('../pages/ClanWarPlanner'),
};

const routes = new Map<string, () => Promise<unknown>>([
  ['builder', pageLoaders.builder],
  ['faq', pageLoaders.faq],
  ['best-decks', pageLoaders.bestDecks],
  ['upgrades', pageLoaders.upgrades],
  ['cards', pageLoaders.cards],
  ['clan', pageLoaders.clan],
]);

export function preloadGenerator(): void {
  void pageLoaders.generator().catch(() => {});
}

/** Only warm the destination someone is hovering, focusing, or touching. */
export function preloadPage(pathname: string): void {
  const [first = '', second] = pathname.split('/').filter(Boolean);
  const load = first === 'cards' && second
    ? pageLoaders.cardPage
    : routes.get(first) ?? (!second && isValidTag(first) ? pageLoaders.generator : undefined);
  void load?.().catch(() => {});
}
