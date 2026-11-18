import type { HTMLAttributes, ReactNode } from 'react';
import type { CatalogCard } from '../api';
import type { CardVersion } from '../lib/cardDisplay';
import { cardIconUrl } from '../lib/cardDisplay';
import { getTheme } from '../theme';
import CardTile from './CardTile';
import CardLink from './CardLink';
import { ChangePill } from './WinRateChange';

export const changeTileBox = (isMobile: boolean) => ({
  ...styles.tile,
  flexBasis: isMobile ? '74px' : '86px',
  width: isMobile ? '74px' : '86px',
});

export function ChangeTileRow({ isMobile, children, ...rest }: { isMobile: boolean; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} style={{ ...styles.scroller, gap: isMobile ? '20px' : '16px' }}>
      {children}
    </div>
  );
}

interface ChangeTileProps {
  card: CatalogCard;
  version?: CardVersion;
  change: number;
  detail: ReactNode;
  isMobile: boolean;
}

export function ChangeTile({ card, version = 'normal', change, detail, isMobile }: ChangeTileProps) {
  const theme = getTheme();
  return (
    <div style={changeTileBox(isMobile)}>
      <CardLink name={card.name}>
        <CardTile
          name={card.name}
          iconUrl={cardIconUrl(card.iconUrls, version)}
          elixirCost={card.elixirCost}
          nameColor={theme.text.primary}
          nameSize="11.5px"
          lazyLoad
        />
        <div style={styles.change}>
          <ChangePill change={change} large />
        </div>
        <div style={{ ...styles.detail, color: theme.text.tertiary }}>{detail}</div>
      </CardLink>
    </div>
  );
}

const styles = {
  scroller: {
    display: 'flex' as const,
    overflowX: 'auto' as const,
    padding: '12px 2px 10px',
    scrollbarWidth: 'thin' as const,
  },
  tile: {
    flexShrink: 0,
    textAlign: 'center' as const,
  },
  change: {
    marginTop: '5px',
  },
  detail: {
    marginTop: '3px',
    fontSize: '11px',
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
};
