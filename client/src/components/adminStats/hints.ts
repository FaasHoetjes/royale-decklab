// A visitor is an anonymous code from the IP address and the browser's user agent, renewed every month.
const VISITOR = 'A visitor is one browser type on one network: two people with the same phone on the same wifi count as one, while someone moving between wifi and mobile data counts twice.';
const MONTHLY = 'The anonymous codes renew each month, so on a range across two months';

export const HINTS = {
  visitors: `Visitors who opened any page. ${VISITOR} ${MONTHLY} someone can count twice. Bots and link previews aren't counted.`,
  pageviews: 'Every page opened, repeats included: the same page opened five times counts five. Before this was added, a page counted once per visitor per day, so older periods show fewer and get no comparison.',
  activeUsers: 'Visitors who looked up a player tag themselves. Opening a shared lineup or a player from the clan page doesn\'t count.',
  lookups: 'Players looked up, counting each player once per visitor per day.',
  uniquePlayers: `Different player tags looked up, whoever looked them up. ${MONTHLY} a player looked up in both counts twice.`,
  returning: `Active users who looked up a player on more than one day in this period. ${MONTHLY} days in different months don't link up.`,
  timeOnSite: 'Median time a visitor had the site open in a visible tab over the period, capped at 4 hours a day. Visitors from before this was measured are left out.',
  deckCopies: 'Every time a deck link was copied.',
  deckOpens: 'Every click on "open in game". Shows intent; it doesn\'t confirm the deck was imported.',
  exporters: 'Visitors who copied or opened at least one deck.',
  exportRate: 'Share of all visitors who copied or opened at least one deck.',
  shareTaps: 'Taps on the share button for a lineup, once per visitor per day.',
  previews: 'Link previews fetched by Discord, WhatsApp and the like, which roughly counts links posted.',
  shareOpens: 'Shared lineup opens, counting each player once per visitor per day.',
  patchSeen: "Visitors who scrolled the start page's patch section into view, once per visitor per day. Opening a /patch link counts too.",
  patchOpeners: 'Visitors who pressed the patch button at the top of the start page, once per visitor per day.',
  newFromShare: 'Opened a shared lineup, then looked up a different player within 7 days, having looked up no one else before.',
  countries: 'Visitors per country, from Cloudflare. "Looked up" is the share of them who became active users.',
  devices: 'Active users per device type.',
  sources: 'Visitors per site they came from, or a campaign link\'s utm_source. "Looked up" is the share who became active users; the time is their median time on site.',
  pages: 'Visitors who opened each page at least once in the period.',
  inView: 'Visitors with the site open in a visible tab right now.',
} as const;
