import { useState, type ReactNode } from 'react';

interface HoverCardProps {
  label: string;
  card: ReactNode;
  children: ReactNode;
}

/** Shows a small card the moment its trigger is hovered or focused; a tap toggles it on touch screens. */
const HoverCard = ({ label, card, children }: HoverCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-expanded={isOpen}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setIsOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setIsOpen(false)}
      onClick={() => setIsOpen((open) => !open)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setIsOpen(false)}
      style={styles.trigger}
    >
      {children}
      {isOpen && (
        <span role="tooltip" style={styles.card}>
          {card}
        </span>
      )}
    </span>
  );
};

export default HoverCard;

const styles = {
  trigger: {
    position: 'relative' as const,
    display: 'inline-flex' as const,
    flexShrink: 0,
    cursor: 'pointer',
    outline: 'none',
  },
  card: {
    position: 'absolute' as const,
    top: 'calc(100% + 8px)',
    left: 0,
    zIndex: 20,
    display: 'grid' as const,
    gap: '8px',
    minWidth: '210px',
    padding: '12px 14px',
    borderRadius: '12px',
    border: '1px solid var(--panel-border)',
    backgroundColor: 'var(--bg-secondary)',
    boxShadow: 'var(--dialog-shadow)',
    color: 'var(--text-primary)',
    fontSize: '12.5px',
    fontWeight: 400 as const,
    whiteSpace: 'nowrap' as const,
    cursor: 'default',
  },
};
