export const statsStyles = {
  title: {
    margin: 0,
    fontSize: '28px',
  },
  row: {
    display: 'flex' as const,
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  panel: {
    backgroundColor: 'var(--bg-secondary)',
    border: '1px solid var(--panel-border)',
    boxShadow: 'var(--panel-shadow)',
    borderRadius: '16px',
    padding: '16px',
    minWidth: 0,
  },
  heading: {
    margin: '0 0 12px',
    fontSize: '16px',
  },
  note: {
    margin: 0,
    fontSize: '13px',
  },
  button: {
    padding: '10px 18px',
    borderRadius: '8px',
    border: 'none',
    fontWeight: 700 as const,
    cursor: 'pointer',
  },
  ghost: {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid',
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
  link: {
    alignSelf: 'flex-start' as const,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontWeight: 600 as const,
  },
  list: {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: '10px',
  },
  listRow: {
    display: 'flex' as const,
    justifyContent: 'space-between' as const,
    gap: '12px',
    fontSize: '14px',
    marginBottom: '4px',
  },
  listValue: {
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
  },
  track: {
    height: '6px',
    borderRadius: '3px',
    overflow: 'hidden' as const,
  },
  fill: {
    height: '100%',
    borderRadius: '3px',
  },
};
