import { useApp } from '../AppContext';
import { getTheme } from '../theme';

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

const pStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  margin: '0 0 14px',
};

const ulStyle: React.CSSProperties = {
  margin: '0 0 14px',
  paddingLeft: '22px',
};

const liStyle: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: 1.6,
  marginBottom: '8px',
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

const faqItems: FaqItem[] = [
  {
    question: 'How is the win rate determined?',
    answer: (
      <>
        <p style={pStyle}>
          The win rate comes from real battle data, not estimates. We collect the recent
          ranked and Path of Legend battles of the top ~500 global players, group those
          battles by the exact 8-card deck that was played, and tally wins and losses for
          each deck (a draw counts as half a win). This data is refreshed in the background
          every couple of hours and accumulated over a rolling 7-day window, so each deck's
          sample keeps growing rather than resetting on every update — that's what makes the
          numbers trustworthy. After a Clash Royale balance update we reset the window to that
          patch, so buffed and nerfed cards are judged only on post-patch games (win rates show
          lower confidence for a few days while fresh data builds up).
        </p>
        <p style={pStyle}>
          The percentage shown is <strong>not</strong> the raw win rate, though. A deck that
          went 3-0 isn't really better than one that won 58% of 300 games — three games is
          just too little to trust. So we display a <strong>confidence-adjusted win rate</strong>{' '}
          (the Wilson score lower bound): the more games a deck has been played, the closer
          the adjusted figure sits to its raw win rate; with only a handful of games it gets
          pulled down toward 50% to reflect the uncertainty.
        </p>
        <p style={pStyle}>
          The upshot: a strong record over many games ranks above a perfect record over a
          few. Hover the <span style={inlineInfo}>i</span> icon next to any deck's win rate to
          see its raw win rate, the number of games behind it, and how many of the sampled
          players ran the deck (its pick rate).
        </p>
      </>
    ),
  },
  {
    question: 'How is the player score determined?',
    answer: (
      <>
        <p style={pStyle}>
          The player score adapts a deck's meta strength to <em>your</em> specific card
          collection, so the four recommended decks are ones you can actually field at a
          competitive level. It multiplies four factors:
        </p>
        <p style={{ ...pStyle, fontFamily: 'monospace', fontSize: '14px' }}>
          score = adjusted win rate × popularity × avg card level × version fit
        </p>
        <ul style={ulStyle}>
          <li style={liStyle}>
            <strong>Adjusted win rate</strong> — the confidence-adjusted meta win rate
            described above.
          </li>
          <li style={liStyle}>
            <strong>Popularity</strong> — how many distinct top players actually run the deck.
            A deck only one or two players use is discounted, even at a high win rate, since one
            person's pet deck isn't really "meta". The more players behind a deck, the closer
            this factor gets to its full weight.
          </li>
          <li style={liStyle}>
            <strong>Average card level</strong> — the average of (your level ÷ max level)
            across all 8 cards. Cards you've leveled closer to max push the score up.
          </li>
          <li style={liStyle}>
            <strong>Version fit</strong> — a small penalty when the meta deck relies on an
            Evolution or Hero version of a card that you don't have (about a 10% penalty for a
            missing Evolution, 20% for a missing Hero).
          </li>
        </ul>
        <p style={pStyle}>
          Decks are then ranked by this score, and we greedily pick the four highest-scoring
          decks that share no cards with one another (war decks can't reuse cards).
        </p>
      </>
    ),
  },
];

export default function Faq() {
  const { isDarkMode } = useApp();
  const theme = getTheme(isDarkMode);

  return (
    <div style={styles.container}>
      <div style={{ ...styles.header, borderBottomColor: theme.border }}>
        <h2 style={{ color: theme.text.primary, margin: 0 }}>FAQ</h2>
        <p style={{ ...styles.subtitle, color: theme.text.secondary, marginTop: '8px' }}>
          How the War Deck Generator scores and ranks decks.
        </p>
      </div>

      <div style={styles.list}>
        {faqItems.map((item) => (
          <section
            key={item.question}
            style={{
              ...styles.item,
              backgroundColor: theme.bg.secondary,
              borderColor: theme.border,
            }}
          >
            <h3 style={{ ...styles.question, color: theme.text.primary }}>{item.question}</h3>
            <div style={{ color: theme.text.secondary }}>{item.answer}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '760px',
    margin: '0 auto',
    padding: '20px 0',
  },
  subtitle: {
    fontSize: '15px',
  },
  header: {
    marginBottom: '30px',
    paddingBottom: '20px',
    borderBottom: '1px solid #e0e0e0',
  },
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '24px',
  },
  item: {
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    padding: '24px',
  },
  question: {
    marginTop: 0,
    marginBottom: '14px',
    fontSize: '18px',
  },
};
