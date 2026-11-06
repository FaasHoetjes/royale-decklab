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
      <div style={{ ...styles.stack, gap: isMobile ? '32px' : '36px' }}>
        {[0, 1].map((set) => (
          <section key={set}>
            <div
              style={{
                ...styles.panel,
                ...styles.stack,
                justifyContent: 'flex-end',
                gap: '8px',
                minHeight: isMobile ? '102px' : '118px',
                padding: isMobile ? '16px' : '20px 28px',
                marginBottom: '12px',
                borderRadius: '20px',
              }}
            >
              <Skeleton style={{ width: '150px', height: '24px' }} />
              <Skeleton style={{ width: '150px', height: '34px', marginTop: '2px', borderRadius: '999px' }} />
            </div>
            <div style={{ ...styles.stack, gap: '10px' }}>
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  style={{
                    ...styles.panel,
                    ...styles.deckRow,
                    ...(isMobile ? { gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px', padding: '14px 12px' } : {}),
                  }}
                >
                  <div style={isMobile ? { ...styles.inline, justifyContent: 'space-between', alignItems: 'flex-start' } : { ...styles.stack, gap: '10px' }}>
                    <div style={{ ...styles.stack, gap: '6px' }}>
                      <Skeleton style={{ width: '120px', height: '15px' }} />
                    </div>
                    <div style={{ ...styles.stack, gap: '6px', alignItems: isMobile ? 'flex-end' : 'flex-start' }}>
                      <Skeleton style={{ width: '64px', height: '9px' }} />
                      <Skeleton style={{ width: '52px', height: '18px' }} />
                      <Skeleton style={{ width: '120px', height: '10px' }} />
                    </div>
                  </div>
                  <div
                    style={{
                      ...styles.cards,
                      gridTemplateColumns: isMobile ? 'repeat(4, minmax(0, 1fr))' : 'repeat(8, minmax(0, 1fr))',
                      gap: isMobile ? '10px 8px' : '6px',
                    }}
                  >
                    {Array.from({ length: 8 }, (_, card) => (
                      <div key={card}>
                        <Skeleton style={styles.cardArt} />
                        <Skeleton style={{ width: '72%', height: '7px', margin: '5px auto 0' }} />
                      </div>
                    ))}
                  </div>
                  {isMobile ? (
                    <Skeleton style={{ width: '100%', height: '42px', borderRadius: '10px' }} />
                  ) : (
                    <Skeleton style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
                  )}
                </div>
              ))}
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
      {/* Mirrors the builder: the four deck tabs, the open deck with its stats, then your cards. */}
      <div style={{ ...styles.builderTabs, gap: isMobile ? '6px' : '10px' }}>
        {[0, 1, 2, 3].map((tab) => (
          <Skeleton key={tab} style={{ height: isMobile ? '62px' : '58px', borderRadius: '12px' }} />
        ))}
      </div>
      <div
        style={{
          ...styles.builderStage,
          gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 250px',
          gap: isMobile ? '18px' : '36px',
          margin: isMobile ? '14px 0 26px' : '30px 0 40px',
        }}
      >
        <div>
          <Skeleton style={{ width: '200px', height: isMobile ? '19px' : '24px', marginBottom: isMobile ? '12px' : '18px' }} />
          <div style={{ ...styles.cards, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: isMobile ? '10px 8px' : '14px', maxWidth: '500px' }}>
            {Array.from({ length: 8 }, (_, card) => (
              <div key={card}>
                <Skeleton style={styles.cardArt} />
                <Skeleton style={{ width: '60%', height: '8px', margin: '5px auto 0' }} />
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...styles.stack, gap: '12px' }}>
          <Skeleton style={{ width: '130px', height: isMobile ? '34px' : '44px' }} />
          <Skeleton style={{ width: '150px', height: '12px' }} />
          {!isMobile && <Skeleton style={{ width: '100%', height: '64px', marginTop: '18px' }} />}
        </div>
      </div>
      <Skeleton style={{ width: '100%', height: '38px', borderRadius: '10px', marginBottom: '18px' }} />
      <div
        style={{
          ...styles.cards,
          gridTemplateColumns: isMobile ? 'repeat(4, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(84px, 1fr))',
          gap: isMobile ? '10px 8px' : '14px 12px',
        }}
      >
        {Array.from({ length: isMobile ? 8 : 20 }, (_, card) => (
          <Skeleton key={card} style={styles.cardArt} />
        ))}
      </div>
    </LoadingRegion>
  );
}

export function UpgradeAdvisorSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Simulating your upgrades">
      {/* Mirrors UpgradePreview: the picked card and score, then the four lineup decks. */}
      <section
        style={{
          ...styles.panel,
          borderRadius: '18px',
          padding: isMobile ? '14px' : '22px 22px 20px',
          marginBottom: '28px',
        }}
      >
        <div style={{ ...styles.inline, gap: isMobile ? '12px' : '16px' }}>
          <Skeleton style={{ width: isMobile ? '46px' : '60px', aspectRatio: '0.82', borderRadius: '10px', flexShrink: 0 }} />
          <div style={{ ...styles.stack, gap: '7px', flex: 1, minWidth: 0 }}>
            <Skeleton style={{ width: '70px', height: '10px' }} />
            <Skeleton style={{ width: isMobile ? '120px' : '190px', maxWidth: '100%', height: isMobile ? '16px' : '19px' }} />
            {!isMobile && <Skeleton style={{ width: '220px', maxWidth: '100%', height: '12px' }} />}
          </div>
          <div style={{ ...styles.stack, gap: '6px', alignItems: 'flex-end' }}>
            <Skeleton style={{ width: isMobile ? '70px' : '94px', height: isMobile ? '28px' : '36px' }} />
            <Skeleton style={{ width: isMobile ? '46px' : '96px', height: '10px' }} />
          </div>
        </div>
        <div style={{ ...styles.upgradeSlots, gap: isMobile ? '6px' : '10px', marginTop: isMobile ? '14px' : '20px' }}>
          {[0, 1, 2, 3].map((slot) => (
            <Skeleton key={slot} style={{ height: isMobile ? '40px' : '58px', borderRadius: '12px' }} />
          ))}
        </div>
      </section>
      <Skeleton style={{ width: '160px', height: '12px', marginBottom: '10px' }} />
      {Array.from({ length: 8 }, (_, row) => (
        <div key={row} style={{ ...styles.upgradeRow, padding: isMobile ? '11px 8px' : '11px 10px' }}>
          <Skeleton style={{ width: '14px', height: '12px' }} />
          <Skeleton style={{ width: '36px', aspectRatio: '0.82', borderRadius: '8px' }} />
          <div style={{ ...styles.stack, gap: '6px', flex: 1 }}>
            <Skeleton style={{ width: row % 2 ? '90px' : '120px', maxWidth: '100%', height: '13px' }} />
            <Skeleton style={{ width: isMobile ? '150px' : '260px', maxWidth: '100%', height: '10px' }} />
          </div>
          <Skeleton style={{ width: '48px', height: '14px' }} />
        </div>
      ))}
    </LoadingRegion>
  );
}

export function ClanWarSkeleton({ isMobile }: { isMobile: boolean }) {
  return (
    <LoadingRegion label="Loading the clan war">
      {/* Mirrors ClanWarSummary, then the member rows. */}
      <section style={{ ...styles.panel, borderRadius: '14px', padding: isMobile ? '16px' : '20px 24px', marginBottom: '20px' }}>
        <Skeleton style={{ width: '120px', height: '10px' }} />
        <Skeleton style={{ width: isMobile ? '170px' : '240px', maxWidth: '100%', height: isMobile ? '22px' : '26px', marginTop: '10px' }} />
        <div style={{ ...styles.inline, gap: '28px', marginTop: '18px' }}>
          <Skeleton style={{ width: '64px', height: '30px' }} />
          <Skeleton style={{ width: '64px', height: '30px' }} />
        </div>
      </section>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <div key={row} style={{ ...styles.upgradeRow, padding: '14px 4px' }}>
          <div style={{ ...styles.stack, gap: '6px', flex: 1 }}>
            <Skeleton style={{ width: '140px', maxWidth: '100%', height: '14px' }} />
            <Skeleton style={{ width: '110px', height: '10px' }} />
          </div>
          <Skeleton style={{ width: '52px', height: '12px' }} />
        </div>
      ))}
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
                <div style={{ ...styles.inline, alignItems: 'flex-end', gap: isMobile ? '16px' : '22px', marginTop: '4px' }}>
                  <div style={{ ...styles.stack, gap: '6px' }}>
                    <Skeleton style={{ width: '40px', height: '9px' }} />
                    <Skeleton style={{ width: '56px', height: isMobile ? '18px' : '20px' }} />
                  </div>
                  <Skeleton style={{ width: '96px', height: '12px', marginBottom: '2px' }} />
                  <Skeleton style={{ width: '60px', height: '12px', marginBottom: '2px' }} />
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
  deckRow: {
    display: 'grid' as const,
    gridTemplateColumns: '210px minmax(0, 1fr) auto',
    alignItems: 'center' as const,
    gap: '18px',
    padding: '12px 14px 12px 18px',
    borderRadius: '16px',
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
  builderTabs: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  builderStage: {
    display: 'grid' as const,
    alignItems: 'start' as const,
  },
  upgradeSlots: {
    display: 'grid' as const,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
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
