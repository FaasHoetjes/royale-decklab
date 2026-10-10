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
        The score is the deck's expected win rate for you: its record among top war players,
        adjusted for your card levels and whether you own the required Evolution or Hero
        versions. Card levels are compared with the players you typically face in war, and a
        single card far behind the rest of the deck costs extra, both measured from real Clan War
        battles. A deck's record is rated cautiously, so a deck with only a few games counts as
        barely above average and a lucky streak can't outrank a proven deck. Missing versions
        reduce the score. The four highest scoring decks with no repeated cards are selected, so
        the total is a cautious estimate of your wins per war day.
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
    id: 'customize',
    question: 'Can I customize the generated decks?',
    answer: (
      <>
        <p style={pStyle}>
          Yes. Above your decks you can choose how many decks to generate (one to four), set a
          minimum card level, ban cards you don't want to play, and require cards you do want to
          play. Every option is applied to the search itself, so you get the best decks that meet
          all of them, with no shared cards.
        </p>
        <p style={pStyle}>
          The padlock on a deck locks it: it stays when you change options, and the other decks
          are chosen around its cards. Swap a deck first, then lock it, to build around a favourite.
        </p>
        <p style={pLast}>
          Your choices are saved in the page address, so you can bookmark or share a setup. The
          number of decks and minimum level are also remembered for your next search. If no lineup
          fits, try a lower minimum level or fewer required cards.
        </p>
      </>
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
          deck's proven win rate and your own card levels and unlocked versions.
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
        Knight, Valkyrie, Musketeer and Wizard have both an Evolution and a Hero, and you can unlock
        either one without the other. The Clash Royale API reports this through one{' '}
        <code>evolutionLevel</code> value that works like two switches: 1 means the Evolution is
        unlocked, 2 means the Hero is unlocked, and 3 means both. When you own both, Decklab offers
        both in the Builder. Choose the version you want to field in game.
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
        rate. For ranking, each deck's record is combined with eighty imaginary games at about
        fifty percent, measured from war battles, and the deck is rated at the win rate it is 75%
        likely to reach. A deck that went six for six counts as about 52%, while a deck at 60%
        over hundreds of games keeps most of its rate.
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
