import { useRef, useState } from 'react';
import type { ClanWar, ClanWarMember } from '../../api';
import { getTheme } from '../../theme';
import { slideFold } from '../../lib/motion';
import { ChevronIcon } from '../generator/icons';
import ClanMemberRow from './ClanMemberRow';

interface ClanMemberGroupProps {
  id: string;
  title: string;
  color: string;
  members: ClanWarMember[];
  war: ClanWar;
  youTag: string | null;
  startsOpen: boolean;
  isMobile: boolean;
}

const ClanMemberGroup = ({ id, title, color, members, war, youTag, startsOpen, isMobile }: ClanMemberGroupProps) => {
  const theme = getTheme();
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(startsOpen);
  // Lags `open` while the list slides shut, so the chevron turns right away but the rows stay until covered.
  const [listShown, setListShown] = useState(startsOpen);
  const listId = `clan-group-${id}`;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    slideFold(listRef.current!, next, () => setListShown(next));
  };

  return (
    <section style={styles.group}>
      <h3 style={styles.heading}>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={listId}
          className="mobile-touch-target"
          style={{ ...styles.toggle, color: theme.text.primary }}
        >
          <span style={{ ...styles.dot, backgroundColor: color }} aria-hidden="true" />
          {title}
          <span style={{ ...styles.count, color: theme.text.secondary }}>{members.length}</span>
          <span style={{ ...styles.chevron, color: theme.text.secondary }}>
            <ChevronIcon open={open} />
          </span>
        </button>
      </h3>
      <ul ref={listRef} id={listId} style={{ ...styles.list, display: listShown ? 'block' : 'none' }}>
        {members.map((member) => (
          <ClanMemberRow key={member.tag} member={member} war={war} isMobile={isMobile} isYou={member.tag === youTag} />
        ))}
      </ul>
    </section>
  );
};

export default ClanMemberGroup;

const styles = {
  group: {
    marginBottom: '14px',
  },
  heading: {
    margin: 0,
  },
  toggle: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '10px',
    width: '100%',
    padding: '8px 4px',
    border: 0,
    background: 'none',
    font: 'inherit',
    fontSize: '15px',
    fontWeight: 700 as const,
    textAlign: 'left' as const,
    cursor: 'pointer' as const,
  },
  dot: {
    width: '9px',
    height: '9px',
    borderRadius: '50%',
  },
  count: {
    fontSize: '14px',
    fontWeight: 600 as const,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  chevron: {
    marginLeft: 'auto',
    display: 'inline-flex' as const,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
};
