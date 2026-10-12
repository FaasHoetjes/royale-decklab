import type { CSSProperties, ReactNode } from 'react';

interface SkeletonProps {
  style?: CSSProperties;
}

function Skeleton({ style }: SkeletonProps) {
  return <span className="skeleton" style={{ ...styles.skeleton, ...style }} />;
}

function LoadingRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

export function BestDecksSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Loading best war deck sets">
      <div style={{ ...styles.stack, gap: isMobile ? '28px' : '24px' }}>
        {[0, 1].map((set) => (
          <section
            key={set}
            style={
              isMobile ? undefined : { ...styles.panel, padding: '20px 24px', borderRadius: '16px' }
            }
          >
            <div style={styles.setHeader}>
              <div style={styles.inline}>
                <Skeleton style={{ width: '38px', height: '28px' }} />
                <Skeleton style={{ width: '92px', height: '11px' }} />
              </div>
              <div style={{ ...styles.stack, gap: '5px', alignItems: 'flex-end' }}>
                <Skeleton style={{ width: '58px', height: '9px' }} />
                <Skeleton style={{ width: '52px', height: '19px' }} />
              </div>
            </div>
            <div style={{ ...styles.stack, gap: isMobile ? '14px' : '8px' }}>
              {[0, 1, 2, 3].map((row) =>
                isMobile ? (
                  <div key={row} style={{ ...styles.panel, padding: '14px 12px', borderRadius: '12px' }}>
                    <div style={{ ...styles.inline, justifyContent: 'space-between', marginBottom: '16px' }}>
                      <Skeleton style={{ width: '58px', height: '16px' }} />
                      <div style={{ ...styles.inline, gap: '12px', alignItems: 'flex-end' }}>
                        {[0, 1, 2].map((stat) => (
                          <div key={stat} style={{ ...styles.stack, gap: '4px', alignItems: 'center' }}>
                            <Skeleton style={{ width: '24px', height: '7px' }} />
                            <Skeleton style={{ width: stat === 0 ? '36px' : '30px', height: '13px' }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ ...styles.cards, gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                      {Array.from({ length: 8 }, (_, card) => (
                        <div key={card}>
                          <Skeleton style={styles.cardArt} />
                          <Skeleton style={{ width: '72%', height: '7px', margin: '5px auto 0' }} />
                        </div>
                      ))}
                    </div>
                    <Skeleton style={{ width: '100%', height: '44px', marginTop: '14px', borderRadius: '10px' }} />
                  </div>
                ) : (
                  <div key={row} style={{ ...styles.deckRow, padding: '10px 14px' }}>
                    <div style={{ ...styles.cards, gridTemplateColumns: 'repeat(8, 1fr)' }}>
                      {Array.from({ length: 8 }, (_, card) => (
                        <div key={card}>
                          <Skeleton style={styles.cardArt} />
                          <Skeleton style={{ width: '72%', height: '7px', margin: '5px auto 0' }} />
                        </div>
                      ))}
                    </div>
                    <div style={styles.statPlaceholders}>
                      {[0, 1, 2].map((stat) => (
                        <div key={stat} style={{ ...styles.stack, gap: '5px', alignItems: 'center' }}>
                          <Skeleton style={{ width: '46px', height: '7px' }} />
                          <Skeleton style={{ width: '36px', height: '13px' }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function BuilderSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Loading your war deck builder">
      <div style={{ ...styles.stack, gap: isMobile ? '14px' : '24px' }}>
        {[0, 1, 2, 3].map((deck) => (
          <section
            key={deck}
            style={{ ...styles.panel, padding: isMobile ? '14px 12px' : '20px', borderRadius: '12px' }}
          >
            <div style={{ ...styles.inline, justifyContent: 'space-between', marginBottom: '16px' }}>
              <Skeleton style={{ width: '58px', height: '16px' }} />
              <Skeleton style={{ width: '76px', height: '13px' }} />
            </div>
            <div
              style={{
                ...styles.cards,
                gridTemplateColumns: isMobile ? 'repeat(4, 1fr)' : 'repeat(8, 1fr)',
                gap: isMobile ? '8px' : '10px',
              }}
            >
              {Array.from({ length: 8 }, (_, card) => (
                <div key={card}>
                  <Skeleton style={styles.cardArt} />
                  <Skeleton style={{ width: '60%', height: '8px', margin: '5px auto 0' }} />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </LoadingRegion>
  );
}

export function UpgradeAdvisorSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Simulating your upgrades">
      <section style={{ ...styles.panel, borderRadius: '12px', overflow: 'hidden' }}>
        <div style={styles.tabs}>
          {[0, 1, 2].map((tab) => (
            <div key={tab} style={styles.tabPlaceholder}>
              <Skeleton style={{ width: isMobile ? '54px' : '72px', height: '12px' }} />
              <Skeleton style={{ width: '24px', height: '18px', borderRadius: '999px' }} />
            </div>
          ))}
        </div>
        {Array.from({ length: 8 }, (_, row) => (
          <div
            key={row}
            style={{ ...styles.upgradeRow, padding: isMobile ? '12px' : '14px 18px' }}
          >
            <Skeleton style={{ width: '22px', height: '12px' }} />
            <Skeleton style={{ width: isMobile ? '44px' : '54px', aspectRatio: '0.82', borderRadius: '10px' }} />
            <div style={{ ...styles.stack, gap: '6px', flex: 1 }}>
              <Skeleton style={{ width: row % 2 ? '110px' : '145px', maxWidth: '100%', height: '14px' }} />
              <Skeleton style={{ width: '94px', height: '11px' }} />
            </div>
            {!isMobile && <Skeleton style={{ width: '140px', height: '6px' }} />}
            <div style={{ ...styles.stack, gap: '5px', alignItems: 'flex-end' }}>
              <Skeleton style={{ width: '55px', height: '14px' }} />
              <Skeleton style={{ width: '38px', height: '9px' }} />
            </div>
          </div>
        ))}
      </section>
    </LoadingRegion>
  );
}

export function WarDecksSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Loading your war decks">
      <div style={{ ...styles.resultContainer, padding: isMobile ? '8px 0' : '40px 20px' }}>
        {/* Mirrors GeneratorHeader: the player's name, tag and lineup stats on a banner. */}
        <section
          style={{
            ...styles.resultHeader,
            padding: isMobile ? '16px 16px' : '20px 28px',
            marginBottom: isMobile ? '16px' : '24px',
          }}
        >
          <Skeleton style={{ width: '110px', height: '10px' }} />
          <Skeleton style={{ width: isMobile ? '120px' : '150px', height: isMobile ? '24px' : '30px' }} />
          <div style={{ ...styles.inline, gap: '8px', alignItems: 'flex-end', marginTop: '6px' }}>
            <Skeleton style={{ width: isMobile ? '72px' : '84px', height: isMobile ? '20px' : '24px' }} />
            <Skeleton style={{ width: '72px', height: '10px' }} />
          </div>
        </section>

        {/* The generator controls row. */}
        <div style={{ ...styles.inline, gap: '8px', overflow: 'hidden', marginBottom: isMobile ? '16px' : '24px' }}>
          {[96, 104, 100, 104].map((width, pill) => (
            <Skeleton key={pill} style={{ width: `${width}px`, height: isMobile ? '44px' : '40px', borderRadius: '999px', flexShrink: 0 }} />
          ))}
        </div>

        <div style={{ ...styles.stack, gap: isMobile ? '16px' : '30px' }}>
          {[0, 1, 2, 3].map((deck) => (
            <section key={deck} style={{ ...styles.panel, borderRadius: '18px', overflow: 'hidden' }}>
              {/* Mirrors DeckCard: a banner with the deck's name and stats, then the cards and actions. */}
              <div
                style={{
                  ...styles.stack,
                  justifyContent: 'flex-end',
                  gap: '10px',
                  minHeight: '112px',
                  padding: isMobile ? '16px 16px 18px' : '18px 24px',
                  backgroundColor: 'var(--bg-tertiary)',
                }}
              >
                <Skeleton style={{ width: '52px', height: '12px' }} />
                <Skeleton style={{ width: isMobile ? '150px' : '220px', height: isMobile ? '22px' : '28px' }} />
                <div style={{ ...styles.inline, gap: isMobile ? '24px' : '44px', marginTop: '4px' }}>
                  {[0, 1, 2].map((stat) => (
                    <div key={stat} style={{ ...styles.stack, gap: '6px' }}>
                      <Skeleton style={{ width: '40px', height: '9px' }} />
                      <Skeleton style={{ width: '52px', height: isMobile ? '16px' : '19px' }} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding: isMobile ? '14px 14px 16px' : '16px 24px 18px' }}>
                <div
                  style={{
                    ...styles.cards,
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: isMobile ? '10px 8px' : '14px 22px',
                    maxWidth: '560px',
                    margin: '0 auto',
                  }}
                >
                  {Array.from({ length: 8 }, (_, card) => (
                    <div key={card}>
                      <Skeleton style={styles.cardArt} />
                      <Skeleton style={{ width: '68%', height: '8px', margin: '5px auto 0' }} />
                    </div>
                  ))}
                </div>
                <div style={{ ...styles.inline, gap: '8px', marginTop: isMobile ? '14px' : '18px' }}>
                  <Skeleton style={{ width: isMobile ? undefined : '140px', flex: isMobile ? 1 : undefined, height: '38px', borderRadius: '10px' }} />
                  {!isMobile && <span style={{ flex: 1 }} />}
                  <Skeleton style={{ width: '38px', height: '38px', borderRadius: '10px' }} />
                  <Skeleton style={{ width: isMobile ? undefined : '116px', flex: isMobile ? 1 : undefined, height: '38px', borderRadius: '10px' }} />
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

const styles = {
  skeleton: {
    display: 'block',
    borderRadius: '6px',
  },
  stack: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
  },
  inline: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
  },
  panel: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
  },
  setHeader: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: '16px',
    paddingBottom: '14px',
    borderBottom: '1px solid var(--border)',
  },
  deckRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
    borderRadius: '12px',
    border: '1px solid var(--row-border)',
    backgroundColor: 'var(--row-bg)',
  },
  cards: {
    display: 'grid' as const,
    gap: '5px',
    flex: 1,
  },
  cardArt: {
    width: '100%',
    aspectRatio: '0.82',
    borderRadius: '10px',
  },
  statPlaceholders: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-around' as const,
    gap: '18px',
    flexShrink: 0,
  },
  tabs: {
    display: 'flex' as const,
    borderBottom: '1px solid var(--border)',
  },
  tabPlaceholder: {
    flex: 1,
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: '6px',
    padding: '13px 6px',
  },
  upgradeRow: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '14px',
    borderBottom: '1px solid var(--border)',
  },
  resultContainer: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  resultHeader: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    justifyContent: 'flex-end' as const,
    gap: '8px',
    borderRadius: '20px',
    backgroundColor: 'var(--bg-tertiary)',
    boxShadow: 'var(--banner-shadow)',
  },
};
