import { LOWEST_LEVEL_CHOICE, type GeneratorOptions } from '../../lib/generatorOptions';

export default function Shortfall({ found, options, onChange, isMobile }: {
  found: number;
  options: GeneratorOptions;
  onChange: (options: GeneratorOptions) => void;
  isMobile: boolean;
}) {
  const missing = options.decks - found;
  const set = (patch: Partial<GeneratorOptions>) => onChange({ ...options, ...patch });
  const { minLevel } = options;

  // `short` is the phone label: three buttons have to share one row there.
  const fixes: { label: string; short: string; apply: () => void }[] = [];
  if (minLevel != null) {
    if (minLevel > LOWEST_LEVEL_CHOICE) {
      const lower = minLevel - 1;
      fixes.push({ label: `Lower to level ${lower}+`, short: `Level ${lower}+`, apply: () => set({ minLevel: lower }) });
    }
    // "Any level" next to "Lower" only when the level is the one thing set; otherwise each other rule gets its button.
    if (minLevel <= LOWEST_LEVEL_CHOICE || (options.require.length === 0 && options.ban.length === 0)) {
      fixes.push({ label: 'Any level', short: 'Any level', apply: () => set({ minLevel: null }) });
    }
  }
  if (options.require.length) {
    fixes.push({ label: 'Clear included cards', short: 'Clear included', apply: () => set({ require: [] }) });
  }
  if (options.ban.length) {
    fixes.push({ label: 'Clear excluded cards', short: 'Clear excluded', apply: () => set({ ban: [] }) });
  }
  if (found > 0) {
    const deckWord = found === 1 ? 'deck' : 'decks';
    fixes.push({
      label: `Show just ${found} ${deckWord}`,
      short: `Show ${found} ${deckWord}`,
      apply: () => set({ decks: found, lock: options.lock.slice(0, found) }),
    });
  }

  const onlyLevel = minLevel != null && options.require.length === 0 && options.ban.length === 0;
  const title = found === 0
    ? 'No decks fit these options'
    : `Only ${found} of ${options.decks} decks ${found === 1 ? 'fits' : 'fit'}`;
  const noDecksReason = onlyLevel
    ? `None of your popular war decks has every card at level ${minLevel} or higher.`
    : 'None of your popular war decks fits all of these options.';
  const subject = onlyLevel ? `A minimum level of ${minLevel}` : 'Your options';
  const verb = onlyLevel ? 'rules' : 'rule';
  const reason = found === 0
    ? noDecksReason
    : `${subject} ${verb} out the other ${missing} deck${missing === 1 ? '' : 's'}.`;

  return (
    <div style={{ ...styles.shortfall, ...(isMobile && styles.shortfallMobile) }} role="status">
      <svg style={styles.shortfallIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5 2.8 19.5h18.4z" />
        <path d="M12 10v4.5M12 17.2v.3" />
      </svg>
      <div style={styles.shortfallText}>
        <div style={styles.shortfallTitle}>{title}</div>
        <div style={styles.shortfallReason}>{reason}</div>
      </div>
      {fixes.length > 0 && (
        <div style={{ ...styles.shortfallFixes, ...(isMobile && { flexBasis: '100%' }) }}>
          {fixes.map((fix) => (
            <button
              key={fix.label}
              type="button"
              onClick={fix.apply}
              style={{ ...styles.fix, ...(isMobile ? styles.fixMobile : { height: '34px' }) }}
            >
              {isMobile ? fix.short : fix.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  shortfall: {
    margin: '0 0 20px',
    padding: '16px 18px',
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: '12px 14px',
    borderRadius: '14px',
    border: '1px dashed var(--border-strong)',
    backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 50%, transparent)',
    boxShadow: 'var(--panel-shadow)',
  },
  shortfallMobile: {
    margin: '0 0 16px',
    padding: '14px 16px',
    alignItems: 'flex-start' as const,
  },
  shortfallIcon: {
    flex: 'none',
    color: 'var(--accent)',
  },
  shortfallText: {
    flex: '1 1 260px',
    minWidth: 0,
  },
  shortfallTitle: {
    fontSize: '15px',
    fontWeight: 700 as const,
    color: 'var(--text-primary)',
  },
  shortfallReason: {
    marginTop: '2px',
    fontSize: '14px',
    lineHeight: 1.45,
    color: 'var(--text-secondary)',
  },
  shortfallFixes: {
    display: 'flex' as const,
    flexWrap: 'wrap' as const,
    gap: '8px',
  },
  fix: {
    padding: '0 12px',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    borderRadius: '10px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    backgroundColor: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: 600 as const,
    whiteSpace: 'nowrap' as const,
    cursor: 'pointer',
  },
  fixMobile: {
    height: '40px',
    flex: '1 1 auto',
    justifyContent: 'center' as const,
    padding: '0 10px',
  },
};
