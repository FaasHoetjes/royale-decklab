export interface FaqItem {
  question: string;
  answer: React.ReactNode;
  id?: string;
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

export const faqItems: FaqItem[] = [
  {
    question: 'What is Royale Decklab?',
    answer: (
      <p style={pLast}>
        Royale Decklab is a free companion for Clash Royale Clan Wars. It recommends four decks
        for your collection, suggests valuable upgrades, and lets you build and score your own
        war decks. It is an independent fan project and is not affiliated with Supercell.
      </p>
    ),
  },
  {
    id: 'player-score',
    question: "How is a deck's player score determined?",
    answer: (
      <p style={pLast}>
        The score combines the deck's expected win rate at your card levels, how widely top war
        players use it, and whether you own the required Evolution or Hero versions. Results with
        very few games are treated cautiously, and missing versions reduce the score. The four
        highest scoring decks with no repeated cards are selected.
      </p>
    ),
  },
  {
    question: 'What is the War Deck Generator?',
    answer: (
      <p style={pLast}>
        Enter a player tag to receive four strong decks with no cards repeated between them. The
        generator starts with decks used by leading war players, then accounts for your card
        levels and the Evolutions and Heroes you can use.
      </p>
    ),
  },
  {
    question: 'Why did my recommended decks change?',
    answer: (
      <p style={pLast}>
        Recommendations change when your card levels or unlocked versions change, and as new war
        battles enter the data. A balance update also starts a fresh data window, which can shift
        the strongest decks.
      </p>
    ),
  },
  {
    question: 'Why is a recommended deck using a card that is not maxed?',
    answer: (
      <p style={pLast}>
        The generator weighs card levels against a deck's proven strength. A strong deck can still
        be your best option with one lower level card, and upgrading that card will improve its
        score.
      </p>
    ),
  },

  {
    question: 'How does the upgrade advisor pick cards?',
    answer: (
      <p style={pLast}>
        It tests every available card level, Evolution, and Hero upgrade one at a time. For each
        test, it rebuilds your best four decks and measures the change in total score. The list is
        ranked by that gain, including upgrades that make a different deck worth using.
      </p>
    ),
  },
  {
    question: 'How does the War Deck Builder score decks?',
    answer: (
      <p style={pLast}>
        Known meta decks receive the same score as generated recommendations, based on your
        collection and their proven performance. Other decks receive a cautious estimate and rank
        below proven decks. The total is the sum of four decks, with one use of each card across
        the set and the usual Evolution and Hero slot rules.
      </p>
    ),
  },
  {
    id: 'builder-score-symbols',
    question: 'What do the ★ and ~ symbols next to a deck score mean?',
    answer: (
      <>
        <p style={pStyle}>
          A <strong>★</strong> means the deck exactly matches a deck that top war players
          actually run. It is scored the same way as a generated recommendation, using that
          deck's proven win rate, how widely it is played, and your own card levels and unlocked
          versions.
        </p>
        <p style={pLast}>
          A <strong>~</strong> means the deck is not one of those known decks, so there is no real
          record to score it on. It receives a cautious estimate that assumes a neutral fifty
          percent win rate at your card levels and treats the deck as unproven, which keeps it
          below any ★ deck. This is why changing a single card in a meta deck can drop the score
          sharply: the deck stops matching a known deck and switches to the cautious estimate.
        </p>
      </>
    ),
  },
  {
    question: 'Why does the War Deck Builder show both an Evolution and a Hero version of my card?',
    answer: (
      <p style={pLast}>
        The Clash Royale API reports these unlocks through one cumulative{' '}
        <code>evolutionLevel</code> value rather than separate Evolution and Hero ownership fields.
        Level 1 means the Evolution is unlocked, while level 2 means the Hero is unlocked and also
        includes level 1. When a card has both versions, Decklab therefore offers both in the
        Builder. Choose the version that matches what you can use in game.
      </p>
    ),
  },
  {
    question: 'What is the Best War Decks page?',
    answer: (
      <p style={pLast}>
        It is a leaderboard of the strongest four deck war sets in the current meta. It assumes a
        complete maxed collection, so it shows the overall meta rather than personal
        recommendations. You can send any set to the Builder to see how it works with your cards.
      </p>
    ),
  },
  {
    question: "How is a deck's winrate determined?",
    answer: (
      <p style={pLast}>
        Win rate comes from real Clan War battles played by roughly 5,000 players in leading war
        clans. Exact eight card decks are grouped and their results counted over the current
        thirty day window. Draws count as half a win, and the displayed percentage is the raw win
        rate.
      </p>
    ),
  },
  {
    question: 'How fresh is the data?',
    answer: (
      <p style={pLast}>
        Battle data is refreshed every few hours and retained for thirty days, covering roughly
        four war weekends. After a balance update, collection begins again for the new patch, so
        the first few days have less data behind the results.
      </p>
    ),
  },
];
