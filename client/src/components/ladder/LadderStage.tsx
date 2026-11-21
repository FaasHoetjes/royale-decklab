import type { CSSProperties } from 'react';
import type { ScoredDeck } from '../../api';
import { avgElixir, cardIconUrl, displayLevel, orderBySlots, slotVersionOf, versionOf } from '../../lib/cardDisplay';
import { buildDeckLink } from '../../lib/deckLink';
import type { LadderPlace } from '../../lib/ladder';
import CardLink from '../CardLink';
import CardTile from '../CardTile';
import DeckLinkAction from '../DeckLinkAction';
import InfoTip from '../InfoTip';
import PlaceArt from './PlaceArt';

interface LadderStageProps {
  deck: ScoredDeck;
  name: string;
  place: LadderPlace;
  /** Shown above the deck's name: where the player plays. */
  where: string;
  rangeLevel: number;
  isMobile: boolean;
}

const FAN_STEP_DEGREES = 4;
const FAN_DROP_PX = 2.2;

/** The player's arena or league in a spotlight, with their deck fanned out in front of it. */
export default function LadderStage({ deck, name, place, where, rangeLevel, isMobile }: LadderStageProps) {
  const cards = orderBySlots(deck.cards, slotVersionOf(deck.metaCardVersions, deck.cardVersions));
  const ownLevel = cards.reduce((sum, c) => sum + displayLevel(c.level, c.maxLevel), 0) / cards.length;
  const middle = (cards.length - 1) / 2;
  const games = deck.uses === 1 ? 'game' : 'games';
  const players = deck.players === 1 ? 'player' : 'players';

  const chance = (
    <div style={styles.stat}>
      <b className="ladder-number" style={styles.statValue}>{Math.round(deck.playerScore * 100)}%</b>
      <span style={styles.statLabel}>
        Your win chance
        <InfoTip ariaLabel="How your win chance is derived" color="var(--hero-muted)" placement="bottom">
          <strong>Your chance to win a game with this deck.</strong>
          <br />
          Starts from the deck's win rate in your range, with the level gap of each game taken out, then factors in how
          your card levels compare to the usual levels there. Missing Evolutions and Heroes lower it. Win rates are
          rated cautiously, so a deck with only a few games can't ride a lucky streak.
        </InfoTip>
      </span>
    </div>
  );
  const played = (
    <div style={{ ...styles.stat, alignItems: isMobile ? 'flex-start' : 'flex-end' }}>
      <b className="ladder-number" style={styles.statValue}>{deck.uses.toLocaleString()}</b>
      <span style={styles.statLabel}>{games} by {deck.players.toLocaleString()} {players}</span>
    </div>
  );

  return (
    <section style={{ ...styles.stage, padding: isMobile ? '18px 14px 0' : '22px 26px 0' }} aria-label="Your best deck">
      <div className="ladder-rays" aria-hidden="true" />
      {isMobile ? (
        <>
          <PlaceArt place={place} className="ladder-float" style={styles.artMobile} priority />
          <div style={styles.statsMobile}>
            {chance}
            {played}
          </div>
        </>
      ) : (
        <div style={styles.top}>
          {chance}
          <PlaceArt place={place} className="ladder-float" style={styles.art} priority />
          {played}
        </div>
      )}

      <div style={styles.title}>
        <span style={styles.eyebrow}>{where}</span>
        <h2 style={{ ...styles.name, fontSize: isMobile ? '24px' : '32px' }}>{name}</h2>
      </div>

      <div style={isMobile ? styles.gridMobile : styles.fan}>
        {cards.map((card, index) => {
          const offset = index - middle;
          const fanned: CSSProperties = isMobile
            ? {}
            : { transform: `rotate(${offset * FAN_STEP_DEGREES}deg) translateY(${offset * offset * FAN_DROP_PX}px)` };
          return (
            <div key={card.id} style={isMobile ? undefined : { ...styles.fanSlot, ...fanned }}>
              <div className="ladder-deal" style={{ animationDelay: `${index * 55}ms` }}>
                <CardLink name={card.name} title={`${card.name} · Level ${displayLevel(card.level, card.maxLevel)}`}>
                  <CardTile
                    name={card.name}
                    iconUrl={cardIconUrl(card.iconUrls, versionOf(deck.cardVersions, card.id))}
                    slotIndex={index}
                    elixirCost={card.elixirCost ?? null}
                    level={displayLevel(card.level, card.maxLevel)}
                    boosted={card.boostedFromLevel != null}
                    showName={false}
                    fetchPriority="high"
                  />
                </CardLink>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.footer}>
        <span style={styles.chip}><b style={styles.chipValue}>{avgElixir(deck.cards).toFixed(1)}</b> elixir</span>
        <span style={styles.chip}>
          Your levels <b style={styles.chipValue}>{ownLevel.toFixed(1)}</b> vs <b style={styles.chipValue}>{rangeLevel.toFixed(1)}</b> here
        </span>
        <DeckLinkAction
          link={buildDeckLink(cards.map((c) => c.id))}
          isMobile={isMobile}
          className="mobile-touch-target"
          style={styles.action}
          label={isMobile ? 'Open in game' : 'Copy deck link'}
        />
      </div>
    </section>
  );
}

const styles = {
  stage: {
    position: 'relative' as const,
    isolation: 'isolate' as const,
    overflow: 'hidden' as const,
    borderRadius: '24px',
    border: '1px solid var(--panel-border)',
    background: 'radial-gradient(ellipse 70% 60% at 50% 38%, color-mix(in srgb, var(--accent) 30%, var(--hero-bg)), var(--hero-bg) 70%)',
    boxShadow: 'var(--banner-shadow)',
    color: 'var(--hero-text)',
  },
  top: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr auto 1fr',
    gap: '16px',
    alignItems: 'center' as const,
  },
  art: {
    width: '300px',
    height: '250px',
    filter: 'drop-shadow(0 26px 30px rgba(0, 0, 0, 0.5))',
  },
  artMobile: {
    width: '210px',
    height: '180px',
    margin: '0 auto',
    filter: 'drop-shadow(0 18px 22px rgba(0, 0, 0, 0.5))',
  },
  statsMobile: {
    display: 'grid' as const,
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginTop: '8px',
  },
  stat: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'flex-start' as const,
    gap: '2px',
    color: 'var(--hero-muted)',
    fontSize: '14px',
  },
  statValue: {
    fontSize: '46px',
    lineHeight: 1,
    color: 'var(--accent)',
    fontWeight: 400 as const,
  },
  statLabel: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: '4px',
  },
  title: {
    textAlign: 'center' as const,
    marginTop: '6px',
  },
  eyebrow: {
    fontSize: '12px',
    fontWeight: 700 as const,
    color: 'var(--accent)',
  },
  name: {
    margin: '2px 0 0',
    fontWeight: 800 as const,
    lineHeight: 1.15,
    color: 'var(--hero-text)',
    textShadow: 'var(--hero-text-shadow)',
  },
  fan: {
    display: 'flex' as const,
    justifyContent: 'center' as const,
    padding: '26px 10px 30px',
  },
  fanSlot: {
    width: '92px',
    flex: 'none',
    margin: '0 -4px',
    transformOrigin: '50% 120%',
  },
  gridMobile: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '10px 8px',
    padding: '18px 0',
  },
  footer: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    gap: '8px',
    paddingBottom: '20px',
  },
  chip: {
    fontSize: '13px',
    padding: '5px 11px',
    borderRadius: '999px',
    background: 'color-mix(in srgb, var(--hero-bg) 70%, transparent)',
    border: '1px solid var(--border)',
    color: 'var(--hero-muted)',
    whiteSpace: 'nowrap' as const,
  },
  chipValue: {
    color: 'var(--hero-text)',
  },
  action: {
    height: '34px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '7px',
    padding: '0 14px',
    borderRadius: '999px',
    border: '1px solid var(--accent)',
    backgroundColor: 'var(--accent)',
    color: 'var(--on-accent)',
    fontSize: '13px',
    fontWeight: 700 as const,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
};
