export type FaqPage = 'generator' | 'builder' | 'upgrades' | 'best-decks';

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
          score your own war decks.
        </p>
        <p style={pLast}>It is an independent fan project and is not affiliated with Supercell.</p>
      </>
    ),
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
          Decks with only a few recorded games are scored cautiously, so a lucky streak cannot put
          an unproven deck ahead of a proven one.
        </p>
        <p style={pLast}>
          The generator selects the four highest-scoring decks with no cards shared between them.
          Their combined score gives a cautious estimate of your wins per war day.
        </p>
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
    question: 'Why have my recommended decks changed?',
    answer: (
      <>
        <p style={pStyle}>
          Your recommendations can change when you upgrade cards, unlock Evolutions or Heroes, or
          when new Clan War battles are added to the data.
        </p>
        <p style={pLast}>
          After a balance update, data collection starts again for the new patch, which can also
          change which decks rank highest.
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
    question: 'How does the Upgrade Advisor choose which cards to recommend?',
    answer: (
      <>
        <p style={pStyle}>
          The Upgrade Advisor tests each available card level, Evolution, and Hero upgrade
          individually. For each upgrade, it recalculates your best four decks and measures the
          change in their combined score.
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
    question: 'How does the War Deck Builder score decks?',
    answer: (
      <>
        <p style={pStyle}>
          Known meta decks are scored in the same way as recommendations from the War Deck
          Generator, using their proven performance and your card collection. Other decks receive a
          cautious estimate and rank below proven decks.
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
          <span style={{ ...scoreSample, color: 'var(--text-secondary)' }}>~ 0.471</span>
          <div>
            <p style={symbolTitle}>Unproven deck</p>
            <p style={pLast}>
              Your deck does not match a known deck in the data, so there is no recorded win rate
              to base its score on. Instead, it receives a cautious estimate using a 50%
              win-rate baseline and your card levels. It is treated as unproven, which keeps its
              score below that of any ★ deck.
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
          Knight, Valkyrie, Musketeer, and Wizard each have an Evolution version and a Hero
          version. You can unlock either version independently.
        </p>
        <p style={pLast}>
          If you have unlocked both, the War Deck Builder shows both options. Choose the version
          you want to use in your deck.
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
    question: 'How is a deck’s win rate calculated?',
    answer: (
      <>
        <p style={pStyle}>
          Win rates are calculated from real Clan War battles played by around 5,000 players in
          top war clans. Results are grouped by exact eight-card deck and counted over the current
          30-day data window.
        </p>
        <p style={pStyle}>Draws count as half a win. The percentage shown is the deck’s raw win rate.</p>
        <p style={pStyle}>
          Rankings use a more cautious estimate. Each deck’s results are combined with a
          baseline equivalent to 80 games at roughly a 50% win rate, based on real Clan War data.
          The ranking also accounts for uncertainty, reducing the influence of small samples and
          lucky streaks.
        </p>
        <p style={pStyle}>
          For example, a deck with six wins from six games is rated at about 52%, while a deck with
          a 60% win rate over hundreds of games retains most of that rating.
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
          Battle data is refreshed every few hours and retained for 30 days, covering roughly four
          war weekends.
        </p>
        <p style={pLast}>
          After a balance update, data collection starts again for the new patch. This means the
          results are based on fewer battles during the first few days.
        </p>
      </>
    ),
  },
];
