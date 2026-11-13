// A visitor is an anonymous code from the IP address and browser, renewed every month.
const VISITOR = 'One browser on one network: a person on wifi and mobile data counts twice, and codes renew each month, so a range across two months can count someone twice.';

export const HINTS = {
  visitors: `Visitors who opened any page. ${VISITOR} Bots and link previews aren't counted.`,
  pageviews: 'Every page opened, repeats included: the same page opened five times counts five. Before this was added, a page counted once per visitor per day.',
  activeUsers: 'Visitors who looked up at least one player tag.',
  lookups: 'Players looked up, counting each player once per visitor per day.',
  uniquePlayers: 'Different player tags looked up, whoever looked them up.',
  returning: 'Active users who looked up a player on more than one day in this period.',
  timeOnSite: 'Median time a visitor had the site open in a visible tab over the period, capped at 4 hours a day. Visitors from before this was measured are left out.',
  deckCopies: 'Every time a deck link was copied.',
  deckOpens: 'Every click on "open in game". Shows intent; it doesn\'t confirm the deck was imported.',
  exporters: 'Visitors who copied or opened at least one deck.',
  exportRate: 'Share of all visitors who copied or opened at least one deck.',
  shareTaps: 'Taps on the share button for a lineup, once per visitor per day.',
  previews: 'Link previews fetched by Discord, WhatsApp and the like, which roughly counts links posted.',
  shareOpens: 'Visitors who opened a shared lineup link, once per player per day.',
  newFromShare: 'Opened a shared lineup, then looked up a different player within 7 days, having looked up no one else before.',
  countries: 'Visitors per country, from Cloudflare. "Looked up" is the share of them who became active users.',
  devices: 'Active users per device type.',
  sources: 'Visitors per site they came from, or a campaign link\'s utm_source. "Looked up" is the share who became active users; the time is their median time on site.',
  pages: 'Visitors who opened each page at least once in the period.',
  inView: 'Visitors with the site open in a visible tab right now.',
} as const;
