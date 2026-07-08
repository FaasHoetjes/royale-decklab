// The FAQ's questions and answers, kept apart from the accordion UI in Faq.tsx.

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
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

const ulStyle: React.CSSProperties = {
  margin: '0',
  paddingLeft: '20px',
};

const liStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.55,
  marginBottom: '6px',
};

const inlineInfo: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '15px',
  height: '15px',
  borderRadius: '50%',
  border: '1px solid currentColor',
  fontSize: '10px',
  fontStyle: 'italic',
  fontWeight: 'bold',
  verticalAlign: 'middle',
};

export const faqItems: FaqItem[] = [
  {
    question: 'How is the win rate determined?',
    answer: (
      <>
        <p style={pStyle}>
          From real <strong>Clan War</strong> battles, the exact mode these decks are for. We
          sample the war battles of the top ~100 war clans (~5,000 players), group them by the
          exact 8-card deck, and tally wins/losses (a draw = half a win) over a rolling 30-day
          window, refreshed every couple of hours. Clan War only runs on weekends, so 30 days
          captures about four war weekends. After a balance patch we reset the window to the new
          patch.
        </p>
        <p style={pLast}>
          The percentage shown is the deck's <strong>raw</strong> win rate. Hover the{' '}
          <span style={inlineInfo}>i</span> icon for the game count and pick rate behind it.
        </p>
      </>
    ),
  },
  {
    question: 'How is the player score determined?',
    answer: (
      <>
        <p style={pStyle}>
          It adapts a deck's meta strength to <em>your</em> collection by multiplying three
          factors:
        </p>
        <p style={{ ...pStyle, fontFamily: 'monospace', fontSize: '14px' }}>
          score = expected win rate × popularity × version fit
        </p>
        <ul style={ulStyle}>
          <li style={liStyle}>
            <strong>Expected win rate</strong>: the win rate <em>you</em> can expect fielding the
            deck at your card levels. It starts from a confidence-adjusted meta win rate (the
            Wilson lower bound: decks with few games are pulled toward 50%, so a strong record
            over many games outranks a perfect record over a few), then adjusts for your levels.
            Card stats grow ~10% per level, and a stat deficit doesn't cost win rate gently: it
            flips interaction breakpoints (the Fireball that no longer kills the Musketeer, the
            unit that survives one extra hit), and a battle chains many such interactions. So the
            deficit shifts the win <em>odds</em>, compounded, rather than shaving the score
            linearly: a 54% deck fielded one full level below max plays like a ~45% deck; two
            levels down, more like ~36%. Levels matter a lot in this game, and the score treats
            them that way.
          </li>
          <li style={liStyle}>
            <strong>Popularity</strong>: how many top players run the deck (a one-person pet deck
            is discounted).
          </li>
          <li style={{ ...liStyle, marginBottom: '12px' }}>
            <strong>Version fit</strong>: a ~6% penalty for each Evolution or Hero version the deck
            actually fields that you don't own (so missing two compounds to ~12%). Only the specials
            the deck really uses count (a deck fields at most two Evos and/or two Heroes), so a card
            that merely <em>has</em> an Evolution but is played as its normal version never counts
            against you. The win rate is measured with those Evos on the field, so missing one means
            you're fielding a genuinely weaker deck than the meta record reflects. Unlike the card
            levels (where the game's known ~10%-per-level curve lets us compute the exact effect),
            this penalty can't be derived from data: top players always field their Evos and Heroes,
            so there's no "same deck without it" to measure against. It's a deliberately modest,
            honest estimate rather than a precise figure.
          </li>
        </ul>
        <p style={pLast}>
          We then pick the four highest-scoring decks that share no cards (war decks can't reuse
          cards).
        </p>
      </>
    ),
  },
  {
    question: 'What does the Swap button do?',
    answer: (
      <p style={pLast}>
        It opens alternatives for that one war slot: other high-scoring decks that{' '}
        <strong>don't share any cards</strong> with your other three, so your four-deck lineup
        stays valid. Each option shows its win rate, your player score, and average elixir; click
        one to drop it into that slot. Use it to dodge a deck you dislike or to try a different
        archetype without rebuilding the whole set.
      </p>
    ),
  },
  {
    question: 'Why does a card show both an Evolution and Hero version when I only own one?',
    answer: (
      <p style={pLast}>
        It's a limitation of the official Clash Royale API: it reports one cumulative{' '}
        <em>evolution level</em> per card and nothing that separates Evolution from Hero
        ownership, so the two are indistinguishable. When the data says you could field either, we
        show a toggle: pick the one you actually own and ignore the other. (The only sure signal
        is a battle log, which is how we detect versions in the meta decks themselves.)
      </p>
    ),
  },
  {
    question: 'Where do my card levels come from?',
    answer: (
      <p style={pLast}>
        Straight from your public profile via the official Clash Royale API, using the player tag
        you enter. If you've recently upgraded cards, it may take a short while for the API to
        reflect the change.
      </p>
    ),
  },
  {
    question: 'Why is a recommended deck using a card I haven’t maxed?',
    answer: (
      <p style={pLast}>
        The score balances meta strength against your card levels. A top meta deck can still come
        out ahead even with one slightly under-leveled card, but leveling it will push that
        deck's score higher.
      </p>
    ),
  },
  {
    question: 'How does the Upgrade Advisor pick cards?',
    answer: (
      <>
        <p style={pStyle}>
          By simulation, not a fixed rule. For every upgrade you could make (leveling a card up, or
          unlocking a card's Evolution or Hero version) we apply that one change, rebuild your best
          four war decks from scratch, and measure how much your lineup's total score rises. The
          list is those gains, ranked.
        </p>
        <p style={pStyle}>
          A card level normally moves one step at a time, but when a single level isn't enough to
          change anything, the advisor reports the smallest bigger jump that would.
        </p>
        <p style={pLast}>
          Because the whole recommendation is re-run, an upgrade can win in two ways: making a deck
          you already field stronger, or pushing a <em>different</em> deck into your top four.
          Those are marked <strong>Unlocks a new deck</strong>. Cards that appear in no current
          meta deck can't move your score, so they never show up.
        </p>
      </>
    ),
  },
  {
    question: 'How does the War Deck Builder score my deck?',
    answer: (
      <>
        <p style={pStyle}>
          The Builder lets you assemble four war decks by hand, with each card used once across all
          four (a war set can't reuse cards), and scores them on the same scale as the
          auto-generated recommendations. Search your player tag first so it knows your card levels
          and which versions you own.
        </p>
        <p style={pStyle}>
          Each deck scores one of two ways. A deck that matches a known meta deck (marked{' '}
          <strong>★</strong>) is scored exactly like a recommendation: the win rate you can expect
          at your card levels, weighted by how widely it's played. Any other deck (marked{' '}
          <strong>~</strong>) is unproven, so it gets a neutral estimate, deliberately dampened to
          sit below any real meta deck. The <strong>Total Score</strong> is the sum of all four.
        </p>
        <p style={pLast}>
          The special slots are positional, matching the game: one slot takes an Evolution, one
          takes a Hero, and a third takes either. An Evolution or Hero you own but place outside its
          slot costs a small penalty, because in-game it would be fielded as its normal version
          there.
        </p>
      </>
    ),
  },
  {
    question: 'What is the Best War Decks page?',
    answer: (
      <>
        <p style={pStyle}>
          It's the raw meta leaderboard: the strongest four-deck war sets right now, ranked by
          performance across the war battles we sample. Unlike your personal recommendations, it
          ignores collections and assumes every card is maxed with all Evolutions and Heroes
          unlocked, so it shows the meta's ceiling rather than what you can field today.
        </p>
        <p style={pLast}>
          Hit <strong>Use in Builder</strong> on any set to drop it into the War Deck Builder and
          score it against your own collection. Cards you don't own are left as empty slots for you
          to fill.
        </p>
      </>
    ),
  },
  {
    question: 'How fresh is the data?',
    answer: (
      <p style={pLast}>
        War battles are refreshed every couple of hours and accumulated over a rolling 30-day
        window. After a balance update we reset to the new patch, so win rates show lower confidence
        for a few days while fresh data builds up.
      </p>
    ),
  },
  {
    question: 'Is this affiliated with Supercell?',
    answer: (
      <p style={pLast}>
        No. Royale DeckLab is an independent fan-made tool built on Supercell's official public
        API. It isn't endorsed by or affiliated with Supercell.
      </p>
    ),
  },
];
