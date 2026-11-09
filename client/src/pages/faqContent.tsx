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

const stepGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: '8px',
};

const stepBox: React.CSSProperties = {
  backgroundColor: 'var(--bg-tertiary)',
  border: '1px solid var(--border)',
  borderRadius: '9px',
  padding: '10px 12px',
};

function WorkedStep({ label, value, note, highlight }: { label: string; value: string; note: string; highlight?: boolean }) {
  return (
    <div style={stepBox}>
      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>{label}</div>
      <div
        style={{
          fontSize: '19px',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: highlight ? 'var(--accent)' : 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '12.5px', lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

export const faqItems: FaqItem[] = [
  {
    question: 'What is Royale DeckLab?',
    answer: (
      <>
        <p style={pStyle}>
          Royale DeckLab is a free tool for Clash Royale Clan Wars. It recommends four decks based
          on your card collection, helps you decide which cards to upgrade, and lets you build and
          score your own war decks. You can also explore card statistics and use the Clan War
          Planner to track your clan’s participation and find decks for each member.
        </p>
        <p style={pLast}>It is an independent fan project and is not affiliated with Supercell.</p>
      </>
    ),
  },
  {
    question: 'How does the War Deck Generator work?',
    answer: (
      <p style={pLast}>
        Enter your player tag to get four recommended war decks with no cards shared between them.
        The generator starts with decks used by top Clan War players, then takes your card levels
        and unlocked Evolutions and Heroes into account.
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
          Yes. Above your decks you can choose how many decks to generate (one to four), set a
          minimum card level, include cards you want to play, and exclude cards you don’t. Every
          option is applied to the search itself, so you get the best decks that meet all of them,
          with no cards shared between them.
        </p>
        <p style={pStyle}>
          The padlock on a deck locks it: the deck stays when you change options, and the other
          decks are chosen around its cards. To build around a favourite deck, swap it in first,
          then lock it.
        </p>
        <p style={pLast}>
          Your choices are saved in the page address, so you can bookmark or share a setup. The
          number of decks and minimum level are also remembered for your next search. If no lineup
          fits, try a lower minimum level or fewer included cards.
        </p>
      </>
    ),
    link: 'generator',
  },
  {
    id: 'remaining-decks',
    question: 'Can I generate decks after I’ve already played some war battles today?',
    answer: (
      <>
        <p style={pStyle}>
          Yes. When your recent war battles are available, the generator shows the decks you have
          already played today. Use the “Plan my last…” button to generate only the remaining
          number of decks, excluding the cards you have already used.
        </p>
        <p style={pLast}>
          These cards are used up until the daily reset. Planning the rest of today does not change
          the number of decks remembered for your next search.
        </p>
      </>
    ),
    link: 'generator',
  },
  {
    question: 'Why have my recommended decks changed?',
    answer: (
      <>
        <p style={pStyle}>
          Your recommendations can change when you upgrade cards, unlock Evolutions or Heroes, or
          when new Clan War battles are added to the data.
        </p>
        <p style={pLast}>
          After a new patch begins, older battles count less toward deck win rates and rankings.
          As new war battles are collected, the recommendations adjust to the latest results.
        </p>
      </>
    ),
  },
  {
    question: 'Why does a recommended deck include a card that isn’t maxed out?',
    answer: (
      <p style={pLast}>
        The generator considers both your card levels and each deck’s proven performance. A strong
        deck can still be your best option even if one card is at a lower level. Upgrading that
        card will improve the deck’s score.
      </p>
    ),
  },
  {
    id: 'sharing-decks',
    question: 'How do I copy a deck into Clash Royale or share my lineup?',
    answer: (
      <>
        <p style={pStyle}>
          On a phone, use “Open in game” on an individual deck to open it in Clash Royale. On
          desktop, use “Copy deck link” to copy a link you can send to your phone.
        </p>
        <p style={pStyle}>
          To share your complete generated lineup, use “Share” above the decks. This shares the
          decks currently on screen, including any swaps you have made. On supported phones it
          opens the share menu; otherwise it copies the link.
        </p>
        <p style={pLast}>
          A shared lineup uses the original player’s card collection. Readers can choose “Get my
          decks” to see recommendations for their own cards.
        </p>
      </>
    ),
  },
  {
    question: 'What does the Best War Decks page show?',
    answer: (
      <>
        <p style={pStyle}>
          The Best War Decks page ranks the strongest sets of four war decks in the current meta.
          The rankings assume a complete, fully maxed card collection, so they show the overall
          meta rather than recommendations tailored to your account.
        </p>
        <p style={pLast}>
          You can open any set in the War Deck Builder to see how it scores with your own cards.
        </p>
      </>
    ),
    link: 'best-decks',
  },
  {
    id: 'cards',
    question: 'What does the Cards page show?',
    answer: (
      <>
        <p style={pStyle}>
          The Cards page shows how each card performs in recorded Clan War battles. Win rate is
          the share of wins in battles using that card, with draws counting as half a win. Play
          rate is the share of recorded decks that include it. Change compares its win rate with
          the previous patch, in percentage points.
        </p>
        <p style={pLast}>
          You can search, filter, and sort the cards. Open a card to see more statistics, how often
          its Evolution or Hero version is played where available, and its best war decks. You
          can also generate your own lineup that includes that card.
        </p>
      </>
    ),
    link: 'cards',
  },
  {
    id: 'card-stats-samples',
    question: 'Why are some card statistics greyed out or missing a change?',
    answer: (
      <>
        <p style={pStyle}>
          Cards with too few recorded games have less reliable win rates. They appear greyed out
          and below cards with enough games when sorting, so a few lucky wins do not put a rarely
          played card at the top.
        </p>
        <p style={pLast}>
          A win-rate change is shown only when the card has enough games in both the current and
          previous patch. If either patch has too little data, there is no change to display yet.
        </p>
      </>
    ),
    link: 'cards',
  },
  {
    question: 'How does the War Deck Builder score decks?',
    answer: (
      <>
        <p style={pStyle}>
          Known meta decks are scored in the same way as recommendations from the War Deck
          Generator, using their proven performance and your card collection. Other decks receive a
          heavily reduced score to reflect the lack of recorded results.
        </p>
        <p style={pLast}>
          Your total score is the sum of your four deck scores. Each card can only be used once
          across the four decks, and the usual Evolution and Hero slot restrictions apply.
        </p>
      </>
    ),
    link: 'builder',
  },
  {
    id: 'builder-score-symbols',
    question: 'What do the ★ and ~ symbols next to a deck’s score mean?',
    answer: (
      <>
        <div style={symbolRow}>
          <span style={{ ...scoreSample, color: 'var(--accent)' }}>★ 0.548</span>
          <div>
            <p style={symbolTitle}>Known deck</p>
            <p style={pLast}>
              Your deck exactly matches a deck used by top Clan War players. It is scored in the
              same way as a generated recommendation, using the deck’s recorded performance, your
              card levels, and your unlocked Evolution and Hero versions.
            </p>
          </div>
        </div>
        <div style={{ ...symbolRow, borderTop: '1px solid var(--border)' }}>
          <span style={{ ...scoreSample, color: 'var(--text-secondary)' }}>~ 0.056</span>
          <div>
            <p style={symbolTitle}>Unproven deck</p>
            <p style={pLast}>
              Your deck does not match a known deck in the data, so there is no recorded win rate
              to base its score on. The Builder starts with a 50% win-rate baseline, adjusts for
              your card levels, then divides the result by nine because the deck is unproven.
              This makes its score much lower; the ~ score is a ranking estimate rather than a
              predicted win rate.
            </p>
          </div>
        </div>
        <p style={{ ...pLast, marginTop: '12px' }}>
          This is why changing even one card in a meta deck can cause a sharp drop in its score: it
          no longer matches a known deck, so the Builder switches to the cautious estimate.
        </p>
      </>
    ),
  },
  {
    question: 'Why does the War Deck Builder show both an Evolution and a Hero version of my card?',
    answer: (
      <>
        <p style={pStyle}>
          Some cards have both an Evolution version and a Hero version. You can unlock either
          version independently.
        </p>
        <p style={pLast}>
          If you have unlocked both, the War Deck Builder shows both options. Choose the version
          you want to use in your deck.
        </p>
      </>
    ),
  },
  {
    question: 'How does the Upgrade Advisor choose which cards to recommend?',
    answer: (
      <>
        <p style={pStyle}>
          The Upgrade Advisor simulates card level upgrades and Evolution and Hero unlocks
          individually. For each upgrade, it recalculates your best four decks and measures the
          change in their combined score. It uses your default recommended lineup as the starting
          point.
        </p>
        <p style={pLast}>
          Upgrades are ranked by how much they improve that score. This includes upgrades that make
          a different deck worth using.
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
          Search for a clan by name or paste its clan tag. The Planner shows its river race,
          members’ war participation, and results from previous weeks where available.
        </p>
        <p style={pStyle}>
          On battle days, members are grouped into “Not started”, “Started”, and “Done” according
          to how many of their four daily decks they have played. Select a group to focus on who
          still has decks left. Choose “Decks” or “Best decks” next to a member to generate a
          lineup using that member’s own card collection.
        </p>
        <p style={pLast}>
          During training days or when a clan is not racing, the Planner shows past participation
          where available. You can still generate decks for its members.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-reliability',
    question: 'What do the Clan War Planner’s reliability badges mean?',
    answer: (
      <>
        <p style={pStyle}>
          The badges describe participation in the available past weeks, counting only weeks when
          the member was in the clan:
        </p>
        <ul style={{ ...pLast, paddingLeft: '20px' }}>
          <li><strong>New:</strong> Fewer than two recorded weeks in the clan.</li>
          <li><strong>Reliable:</strong> At least two recorded weeks, with all 16 war decks played in every one.</li>
          <li><strong>Ghost:</strong> No decks played in the two most recent recorded weeks.</li>
          <li><strong>Slipping:</strong> Fewer than 12 decks played in the latest recorded week, unless marked Ghost.</li>
          <li><strong>Steady:</strong> At least 12 decks played in the latest recorded week, with some missed decks in the available history.</li>
        </ul>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-reminders',
    question: 'Can I remind clan members who still have decks to play?',
    answer: (
      <>
        <p style={pStyle}>
          On battle days, while members still have decks left, use the chat icon beside today’s
          participation summary to open “Remind your clan”. Choose a short message, a message with
          names, or the full list of members who still need to play.
        </p>
        <p style={pLast}>
          Copy the message and paste it into clan chat, or use “Share” where available to send it
          through another app. The message includes a link to your clan’s Planner page so members
          can check their status and find their best decks.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'clan-discord-reminders',
    question: 'How do Discord reminders work, and what do you store?',
    answer: (
      <>
        <p style={pStyle}>
          Use the “Discord reminders” row on your clan’s Planner page. In Discord, create a webhook
          for the channel you want (channel settings, then Integrations, then Webhooks) and paste its
          URL. Before each war day ends, at the time you choose, the site posts who still has decks
          to play. You can send a test first, and optionally ping @here.
        </p>
        <p style={pStyle}>
          We store the webhook URL, with its secret part (the token) encrypted, and use it only to
          post these reminders. Next to it we store your clan tag, the settings you chose and the id
          of your Discord server, which aren’t encrypted. Anyone can see which reminder settings a
          clan uses, but never the webhook or the channel it posts to.
        </p>
        <p style={pLast}>
          Treat the webhook URL like a password: whoever has it can post to your channel, and change
          or turn off its reminders here. To change or turn them off, paste the same URL again.
          Deleting the webhook in Discord stops them too, and we remove it the next time a reminder
          is sent. Anyone can post any clan’s reminders to their own channel, so a reminder for your
          clan isn’t necessarily set up by your clan.
        </p>
      </>
    ),
    link: 'clan',
  },
  {
    id: 'player-score',
    question: 'How is a deck’s player score calculated?',
    answer: (
      <>
        <p style={pStyle}>
          The player score estimates a deck’s win rate for you. It starts with the deck’s results
          among top Clan War players, then adjusts for your card levels and whether you have the
          required Evolution or Hero versions.
        </p>
        <p style={pStyle}>
          Your card levels are compared with those of the opponents you typically face in Clan
          Wars. A card that is much lower in level than the rest of your deck receives an
          additional penalty. Both adjustments are based on real Clan War battles. Missing required
          Evolution or Hero versions also reduces the score.
        </p>
        <p style={pStyle}>
          Decks with fewer recorded games are scored more cautiously to reduce the effect of
          lucky streaks.
        </p>
        <p style={pLast}>
          The generator searches for the highest-scoring set of four decks with no shared cards.
          Their combined score gives a cautious estimate of your wins per war day.
        </p>
      </>
    ),
  },
  {
    question: 'How is a deck’s win rate calculated?',
    answer: (
      <>
        <p style={pStyle}>
          Win rates are calculated from real Clan War battles collected from the top 100 war
          clans and their opponents. Results are grouped by exact eight-card deck over a rolling
          30-day data window.
        </p>
        <p style={pStyle}>
          Draws count as half a win. The displayed deck win rate gives current-patch battles full
          weight and battles from before the latest patch one-quarter weight. This keeps older
          results useful while new war battles are collected.
        </p>
        <p style={pStyle}>
          Rankings use a more cautious estimate. Each deck’s results are combined with a
          baseline equivalent to 80 games at a 52% win rate, based on real Clan War data.
          The ranking also accounts for uncertainty, reducing the influence of small samples and
          lucky streaks.
        </p>
        <p style={pStyle}>
          For example, a deck with six wins from six current-patch games is rated at about 52%,
          while a deck with a 60% win rate over hundreds of games retains most of that rating.
        </p>
        <div style={stepGrid}>
          <WorkedStep label="Record" value="6–0" note="100% raw win rate" />
          <WorkedStep label="Ranked as" value="51.8%" note="after accounting for uncertainty" highlight />
        </div>
      </>
    ),
  },
  {
    question: 'How often is the data updated?',
    answer: (
      <>
        <p style={pStyle}>
          Battle data is refreshed every two hours and retained for 30 days, covering roughly four
          war weekends.
        </p>
        <p style={pStyle}>
          Clan War Planner results are cached for up to 60 seconds. Opening the Planner, returning
          to its browser tab, or pressing “Refresh” requests the latest available results.
        </p>
        <p style={pLast}>
          Card statistics show the current patch. Until its first war battles are available, the
          Cards page shows the previous patch’s statistics with a note explaining the period.
        </p>
      </>
    ),
  },
];
