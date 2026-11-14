import LockIcon from '../components/LockIcon';

export type FaqPage = 'generator' | 'builder' | 'upgrades' | 'best-decks' | 'cards' | 'clan';

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
  id?: string;
  // The page this answer describes, linked below it.
  link?: FaqPage;
}

const pStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  margin: '0 0 12px',
};

const pLast: React.CSSProperties = {
  ...pStyle,
  marginBottom: 0,
};

const symbolRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '68px minmax(0, 1fr)',
  gap: '12px',
  alignItems: 'baseline',
  padding: '10px 0',
};

const symbolTitle: React.CSSProperties = {
  ...pStyle,
  margin: '0 0 2px',
  fontWeight: 600,
  color: 'var(--text-primary)',
};

const scoreSample: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
};

export const faqItems: FaqItem[] = [
  {
    question: 'What is Royale DeckLab?',
    answer: (
      <>
        <p style={pStyle}>
          Royale DeckLab is a free Clash Royale Clan War tool. Generate decks for your card
          collection, build your own lineup, find useful upgrades, explore card statistics, and
          track your clan’s participation.
        </p>
        <p style={pLast}>It is an independent fan project and is not affiliated with Supercell.</p>
      </>
    ),
  },
  {
    question: 'How does the War Deck Generator work?',
    answer: (
      <p style={pLast}>
        Enter your player tag to get four war decks with no shared cards. Recommendations use decks
        played by top Clan War players, adjusted for your card levels and unlocked Evolutions and
        Heroes.
      </p>
    ),
    link: 'generator',
  },
  {
    id: 'customize',
    question: 'Can I customize the generated decks?',
    answer: (
      <>
        <p style={pStyle}>
          Yes. Use the controls above your lineup to choose one to four decks, set a minimum card
          level, and include or exclude cards.
        </p>
        <p style={pStyle}>
          Use a deck’s padlock to keep it while the generator chooses the other decks. To build
          around a favourite deck, swap it in, then lock it.
        </p>
        <p style={pLast}>
          Settings are saved in the page address for bookmarking or sharing. Deck count and minimum
          level are also remembered for future searches. If no lineup fits, lower the minimum level
          or include fewer cards.
        </p>
      </>
    ),
    link: 'generator',
  },
  {
    id: 'remaining-decks',
    question: 'Can I plan my remaining war decks for today?',
    answer: (
      <>
        <p style={pStyle}>
          Yes. When recent war battles are available, the generator shows today’s used decks.
          Choose “Plan my last…” to generate the remaining decks without reusing those cards.
        </p>
        <p style={pLast}>
          This applies until the daily reset and leaves your saved deck count unchanged.
        </p>
      </>
    ),
    link: 'generator',
  },
  {
    id: 'sharing-decks',
    question: 'How do I copy or share my decks?',
    answer: (
      <>
        <p style={pStyle}>
          Use “Open in game” on a phone to open a deck in Clash Royale. On desktop, use “Copy deck
          link” and send the link to your phone.
        </p>
        <p style={pLast}>
          Use “Share” above the generator to share the lineup on screen, including swaps. The link
          uses the original player’s collection; recipients can choose “Get my decks” for their own
          recommendations.
        </p>
      </>
    ),
  },
  {
    id: 'player-score',
    question: 'What does a deck’s player score mean?',
    answer: (
      <>
        <p style={pStyle}>
          The player score estimates a deck’s win rate with your collection. It adjusts the deck’s
          recorded results for your card levels, expected opponents, and missing Evolutions or
          Heroes. Cards far below the rest of the deck receive an extra penalty; decks with fewer
          games receive more cautious scores.
        </p>
        <p style={pLast}>
          The generator aims for the highest combined score across your lineup. A strong deck can
          still be worth using with a lower-level card. For four decks, the total score estimates
          your wins per war day.
        </p>
      </>
    ),
  },
  {
    question: 'Where do deck win rates come from?',
    answer: (
      <>
        <p style={pStyle}>
          Win rates come from Clan War battles played by the top 100 war clans and their opponents
          over the last 30 days. Results are grouped by eight-card deck, with draws counting as half
          a win. Battles from before the latest patch still count.
        </p>
        <p style={pLast}>
          Rankings account for uncertainty, so a few lucky wins do not outweigh consistent results
          over hundreds of games. A deck’s ranking score can therefore be lower than its displayed
          win rate.
        </p>
      </>
    ),
  },
  {
    question: 'What does the Best War Decks page show?',
    answer: (
      <p style={pLast}>
        It ranks sets of four war decks using a fully maxed collection with all Evolutions and
        Heroes unlocked. Open a set in the War Deck Builder to see its score with your own cards.
      </p>
    ),
    link: 'best-decks',
  },
  {
    id: 'cards',
    question: 'What does the Cards page show?',
    answer: (
      <>
        <p style={pStyle}>
          It shows each card’s Clan War win rate, play rate, and win-rate change since the previous
          patch. Draws count as half a win; play rate is the share of recorded decks using the card.
          Changes are shown in percentage points.
        </p>
        <p style={pLast}>
          Search, filter, or sort cards, then open one for detailed statistics and its best war
          decks. You can also generate a lineup that includes it.
        </p>
      </>
    ),
    link: 'cards',
  },
  {
    id: 'card-stats-samples',
    question: 'Why are some card stats greyed out or missing a change?',
    answer: (
      <>
        <p style={pStyle}>
          Cards with too few games have less reliable win rates, so they appear greyed out and sort
          below cards with enough data.
        </p>
        <p style={pLast}>
          A win-rate change appears only when both the current and previous patch have enough games.
        </p>
      </>
    ),
    link: 'cards',
  },
  {
    id: 'builder-score-symbols',
    question: 'How does the War Deck Builder score decks?',
    answer: (
      <>
        <p style={pStyle}>
          The Builder scores decks using your collection or a fully maxed one. Without a player tag,
          it uses the maxed collection. Your total is the sum of the four deck scores.
        </p>
        <div style={symbolRow}>
          <span style={{ ...scoreSample, color: 'var(--accent)' }}>★ 0.548</span>
          <div>
            <p style={symbolTitle}>Known deck</p>
            <p style={pLast}>
              Matches a recorded deck, including its Evolution and Hero setup. Scored like a
              generated recommendation, using its results and your collection.
            </p>
          </div>
        </div>
        <div style={{ ...symbolRow, borderTop: '1px solid var(--border)' }}>
          <span style={{ ...scoreSample, color: 'var(--text-secondary)' }}>~ 0.515</span>
          <div>
            <p style={symbolTitle}>Known cards, different setup</p>
            <p style={pLast}>
              Uses a known deck’s cards with different Evolution or Hero choices or placement. Its
              score uses that deck’s results, with a penalty for missing Evolutions or Heroes that
              have no substitute.
            </p>
          </div>
        </div>
        <div style={{ ...symbolRow, borderTop: '1px solid var(--border)' }}>
          <span style={{ ...scoreSample, color: 'var(--text-secondary)' }}>~ 0.056</span>
          <div>
            <p style={symbolTitle}>Unproven deck</p>
            <p style={pLast}>
              Has no matching deck in the data. It receives a heavily reduced estimate to reflect
              the lack of results. This score is not a predicted win rate.
            </p>
          </div>
        </div>
        <div style={{ ...symbolRow, borderTop: '1px solid var(--border)' }}>
          <span style={{ ...scoreSample, color: 'var(--text-secondary)' }}>
            <LockIcon size={14} />
          </span>
          <div>
            <p style={symbolTitle}>Not scored</p>
            <p style={pLast}>
              Contains a card you don’t own. Switch to the maxed collection to score it.
            </p>
          </div>
        </div>
        <p style={{ ...pLast, marginTop: '12px' }}>
          Replacing one card can make a deck unproven and sharply lower its score. If a card has
          both Evolution and Hero versions unlocked, you can choose either.
        </p>
      </>
    ),
    link: 'builder',
  },
  {
    question: 'How does the Upgrade Advisor rank upgrades?',
    answer: (
      <>
        <p style={pStyle}>
          It simulates each card level upgrade and Evolution or Hero unlock, then recalculates your
          best four decks. Upgrades rank by how much they improve the combined score, including
          improvements that make a different deck worth using.
        </p>
        <p style={pLast}>
          Each upgrade is tested separately against your default recommended lineup.
        </p>
      </>
    ),
    link: 'upgrades',
  },
  {
    id: 'clan-war-planner',
    question: 'How does the Clan War Planner work?',
    answer: (
      <>
        <p style={pStyle}>
          Search by clan name or tag to see its river race, member participation, and available
          results from previous weeks.
        </p>
        <p style={pStyle}>
          On battle days, filter by “Not started”, “Started”, or “Done” to see who still needs to
          play. Choose “Decks” or “Best decks” beside a member to generate a lineup for their cards.
        </p>
        <p style={pLast}>
          On training days or outside a race, you can still view past participation and generate
          members’ decks.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-reliability',
    question: 'What do the clan reliability badges mean?',
    answer: (
      <>
        <p style={pStyle}>
          Badges use recorded weeks when the member was in the clan:
        </p>
        <ul style={{ ...pLast, paddingLeft: '20px' }}>
          <li><strong>New:</strong> Fewer than two recorded weeks.</li>
          <li><strong>Reliable:</strong> All 16 decks played every recorded week, for at least two weeks.</li>
          <li><strong>Ghost:</strong> No decks played in the two latest recorded weeks.</li>
          <li><strong>Slipping:</strong> Under 12 decks in the latest recorded week, unless marked Ghost.</li>
          <li><strong>Steady:</strong> At least 12 decks in the latest recorded week, but not all 16 every week.</li>
        </ul>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-reminders',
    question: 'How do I remind clan members to play?',
    answer: (
      <p style={pLast}>
        On battle days, use the chat icon beside today’s participation summary while members still
        have decks left. Choose a message format, then copy it into clan chat or share it through
        another app. Each message links to your clan’s Planner page.
      </p>
    ),
    link: 'clan',
  },
  {
    id: 'clan-discord-reminders',
    question: 'How do I set up Discord reminders?',
    answer: (
      <>
        <p style={pStyle}>
          Open “Discord reminders” on your clan’s Planner page. Create a channel webhook in Discord
          under Server Settings → Integrations → Webhooks, then paste its URL. Choose when to post
          who still has decks left, send a test, and save. You can also enable @here pings.
        </p>
        <p style={pStyle}>
          We store the webhook with its secret token encrypted, alongside your clan tag, settings,
          and Discord server ID. These other details are not encrypted. The webhook is used only
          for reminders; its URL and destination channel are not shown to visitors.
        </p>
        <p style={pLast}>
          Keep the URL private: anyone with it can post to the channel or manage its reminders.
          Anyone can set up reminders for any clan in their own channel.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-discord-change',
    question: 'How do I change or stop Discord reminders?',
    answer: (
      <>
        <p style={pStyle}>
          Open “Discord reminders” on your clan’s Planner page and paste the same webhook URL to
          load its settings. Make your changes and save, or choose “Turn off reminders”. You can
          recover the URL in Discord under Server Settings → Integrations → Webhooks.
        </p>
        <p style={pLast}>
          Deleting the webhook in Discord also stops reminders. We remove the saved reminder when
          the next delivery detects the deletion.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    question: 'How often is the data updated?',
    answer: (
      <>
        <p style={pStyle}>
          Battle data refreshes every two hours and covers the last 30 days. Recommendations can
          change as new results arrive, older battles drop out, or you upgrade your collection.
        </p>
        <p style={pStyle}>
          Clan War Planner results are cached for up to 60 seconds. Open the page, return to its
          browser tab, or press “Refresh” on battle days to request the latest available results.
        </p>
        <p style={pLast}>
          Card statistics cover the current patch. Until new war data arrives, the Cards page shows
          the previous patch with a note.
        </p>
      </>
    ),
  },
];
