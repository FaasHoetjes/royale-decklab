import { describe, expect, test } from 'bun:test';
import { Glob } from 'bun';

// React diffs inline styles key by key. If a longhand like flexGrow disappears while the flex shorthand stays
// the same, React clears flexGrow to its initial value and never re-applies flex. That collapsed the mobile tabs
// (8146567). The reverse also breaks: a changing shorthand wipes a longhand that stayed the same.

const SHORTHANDS: Record<string, readonly string[]> = {
  flex: ['flexGrow', 'flexShrink', 'flexBasis'],
  flexFlow: ['flexDirection', 'flexWrap'],
  padding: ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'paddingInline', 'paddingBlock'],
  paddingInline: ['paddingInlineStart', 'paddingInlineEnd'],
  paddingBlock: ['paddingBlockStart', 'paddingBlockEnd'],
  margin: ['marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginInline', 'marginBlock'],
  marginInline: ['marginInlineStart', 'marginInlineEnd'],
  marginBlock: ['marginBlockStart', 'marginBlockEnd'],
  border: ['borderTop', 'borderRight', 'borderBottom', 'borderLeft', 'borderColor', 'borderWidth', 'borderStyle'],
  borderTop: ['borderTopColor', 'borderTopWidth', 'borderTopStyle'],
  borderRight: ['borderRightColor', 'borderRightWidth', 'borderRightStyle'],
  borderBottom: ['borderBottomColor', 'borderBottomWidth', 'borderBottomStyle'],
  borderLeft: ['borderLeftColor', 'borderLeftWidth', 'borderLeftStyle'],
  borderColor: ['borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'],
  borderWidth: ['borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'],
  borderStyle: ['borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle'],
  borderRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'],
  background: [
    'backgroundColor',
    'backgroundImage',
    'backgroundSize',
    'backgroundPosition',
    'backgroundRepeat',
    'backgroundClip',
    'backgroundOrigin',
    'backgroundAttachment',
  ],
  gap: ['rowGap', 'columnGap'],
  overflow: ['overflowX', 'overflowY'],
  font: ['fontSize', 'fontWeight', 'fontFamily', 'fontStyle', 'lineHeight'],
  inset: ['top', 'right', 'bottom', 'left'],
  transition: ['transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay'],
  animation: [
    'animationName',
    'animationDuration',
    'animationTimingFunction',
    'animationDelay',
    'animationIterationCount',
    'animationDirection',
    'animationFillMode',
  ],
  outline: ['outlineColor', 'outlineStyle', 'outlineWidth'],
  gridTemplate: ['gridTemplateColumns', 'gridTemplateRows', 'gridTemplateAreas'],
  gridArea: ['gridRow', 'gridColumn'],
  gridRow: ['gridRowStart', 'gridRowEnd'],
  gridColumn: ['gridColumnStart', 'gridColumnEnd'],
  placeItems: ['alignItems', 'justifyItems'],
  placeContent: ['alignContent', 'justifyContent'],
  placeSelf: ['alignSelf', 'justifySelf'],
  textDecoration: ['textDecorationLine', 'textDecorationColor', 'textDecorationStyle'],
  listStyle: ['listStyleType', 'listStylePosition', 'listStyleImage'],
};

const longhandsOf = (shorthand: string): Set<string> => {
  const found = new Set<string>();
  const visit = (key: string) => {
    for (const longhand of SHORTHANDS[key] ?? []) {
      found.add(longhand);
      visit(longhand);
    }
  };
  visit(shorthand);
  return found;
};

const LONGHANDS = new Map(Object.keys(SHORTHANDS).map((shorthand) => [shorthand, longhandsOf(shorthand)]));

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set(Object.values(OPENERS));

/** Walks the code outside strings and comments, calling `visit` with each index and the bracket depth there. */
const walk = (code: string, visit: (index: number, depth: number) => boolean | void) => {
  let depth = 0;
  let i = 0;
  while (i < code.length) {
    const char = code[i] ?? '';
    if (char === '"' || char === "'" || char === '`') {
      i = skipString(code, i);
      continue;
    }
    if (code.startsWith('//', i)) {
      const end = code.indexOf('\n', i);
      i = end === -1 ? code.length : end;
      continue;
    }
    if (code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (CLOSERS.has(char)) depth--;
    if (visit(i, depth)) return;
    if (char in OPENERS) depth++;
    i++;
  }
};

const skipString = (code: string, start: number): number => {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length && code[i] !== quote) {
    if (code[i] === '\\') i++;
    if (quote === '`' && code.startsWith('${', i)) {
      i = closingIndex(code, i + 1);
    }
    i++;
  }
  return i + 1;
};

const closingIndex = (code: string, openIndex: number): number => {
  let close = code.length;
  walk(code.slice(openIndex), (i, depth) => {
    if (i > 0 && depth === 0) {
      close = openIndex + i;
      return true;
    }
  });
  return close;
};

const topLevelIndexes = (code: string, token: string): number[] => {
  const found: number[] = [];
  walk(code, (i, depth) => {
    if (depth === 0 && code.startsWith(token, i)) found.push(i);
  });
  return found;
};

const splitTopLevel = (code: string, separator: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  for (const index of topLevelIndexes(code, separator)) {
    parts.push(code.slice(start, index));
    start = index + separator.length;
  }
  parts.push(code.slice(start));
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
};

const isWrappedIn = (code: string, open: string): boolean =>
  code.startsWith(open) && closingIndex(code, 0) === code.length - 1;

const ternaryParts = (code: string): [string, string] | null => {
  const questions = topLevelIndexes(code, '?').filter((i) => code[i + 1] !== '.' && code[i + 1] !== '?' && code[i - 1] !== '?');
  const question = questions[0];
  if (question === undefined) return null;
  let nested = 0;
  for (const i of topLevelIndexes(code, ':').concat(questions).sort((a, b) => a - b)) {
    if (i <= question) continue;
    if (code[i] === '?') {
      nested++;
      continue;
    }
    if (nested > 0) {
      nested--;
      continue;
    }
    return [code.slice(question + 1, i), code.slice(i + 1)];
  }
  return null;
};

const LITERAL_VALUE = /^(?:'[^']*'|"[^"]*"|`[^`$]*`|-?\d+(?:\.\d+)?)(?:\s+as\s+const)?$/;

type Branch = 'then' | 'else' | 'and';

/** One object whose keys land in the same `style` prop. */
interface StyleSource {
  name: string;
  keys: Map<string, { isLiteral: boolean }>;
  /** The `&&` and ternary branches it sits behind, by condition. Sources behind the same branches come and go together. */
  branches: Map<number, Branch>;
}

/** Keys of an object literal, with whether each value is a fixed literal. Spreads and computed keys are skipped. */
const objectKeys = (body: string): Map<string, { isLiteral: boolean }> => {
  const keys = new Map<string, { isLiteral: boolean }>();
  for (const member of splitTopLevel(body, ',')) {
    if (member.startsWith('...') || member.startsWith('[')) continue;
    const colon = topLevelIndexes(member, ':')[0];
    if (colon === undefined) {
      keys.set(member, { isLiteral: false });
      continue;
    }
    const key = member.slice(0, colon).trim().replace(/^['"]|['"]$/g, '');
    keys.set(key, { isLiteral: LITERAL_VALUE.test(member.slice(colon + 1).trim()) });
  }
  return keys;
};

const styleEntries = (code: string): Map<string, Map<string, { isLiteral: boolean }>> => {
  const entries = new Map<string, Map<string, { isLiteral: boolean }>>();
  const declaration = /\bconst styles\b[^=]*=\s*\{/.exec(code);
  if (!declaration) return entries;
  const open = declaration.index + declaration[0].length - 1;
  const body = code.slice(open + 1, closingIndex(code, open));
  for (const member of splitTopLevel(body, ',')) {
    const entry = /^(\w+)\s*:\s*\{/.exec(member);
    if (!entry) continue;
    const entryOpen = entry[0].length - 1;
    entries.set(entry[1] ?? '', objectKeys(member.slice(entryOpen + 1, closingIndex(member, entryOpen))));
  }
  return entries;
};

/** Every object that can end up in a `style` prop expression, with whether it is only there sometimes. */
const styleSources = (expression: string, entries: Map<string, Map<string, { isLiteral: boolean }>>): StyleSource[] => {
  const sources: StyleSource[] = [];
  let nextCondition = 0;

  const collect = (rawCode: string, branches: Map<number, Branch>) => {
    const code = rawCode.trim();
    if (isWrappedIn(code, '(')) return collect(code.slice(1, -1), branches);

    const arrow = topLevelIndexes(code, '=>')[0];
    if (arrow !== undefined) return collect(code.slice(arrow + 2), branches);

    const ternary = ternaryParts(code);
    if (ternary) {
      const condition = nextCondition++;
      collect(ternary[0], new Map(branches).set(condition, 'then'));
      collect(ternary[1], new Map(branches).set(condition, 'else'));
      return;
    }

    const and = topLevelIndexes(code, '&&').at(-1);
    if (and !== undefined) return collect(code.slice(and + 2), new Map(branches).set(nextCondition++, 'and'));

    if (isWrappedIn(code, '{')) {
      const body = code.slice(1, -1);
      for (const member of splitTopLevel(body, ',')) {
        if (member.startsWith('...')) collect(member.slice(3), branches);
      }
      const keys = objectKeys(body);
      if (keys.size > 0) sources.push({ name: 'inline', keys, branches });
      return;
    }

    const reference = /^styles\.(\w+)$/.exec(code);
    const keys = reference ? entries.get(reference[1] ?? '') : undefined;
    if (reference && keys) sources.push({ name: `styles.${reference[1]}`, keys, branches });
  };

  collect(expression, new Map());
  return sources;
};

const applyTogether = (a: StyleSource, b: StyleSource): boolean =>
  [...a.branches].every(([condition, branch]) => {
    const other = b.branches.get(condition);
    return other === undefined || other === branch;
  });

const comeAndGoTogether = (a: StyleSource, b: StyleSource): boolean =>
  a.branches.size === b.branches.size && applyTogether(a, b);

/**
 * React only writes the keys that changed. A longhand that disappears is reset to its initial value instead of
 * falling back to the shorthand, and a shorthand that changes overwrites the longhand. A longhand the shorthand's
 * own object also sets is safe: when the other one goes away, React writes this value back.
 */
const canDesync = (shorthandSource: StyleSource, shorthand: string, longhandSource: StyleSource, longhand: string): boolean => {
  if (shorthandSource.keys.has(longhand)) return false;
  const shorthandChanges = shorthandSource.keys.get(shorthand)?.isLiteral === false;
  return shorthandChanges || !comeAndGoTogether(shorthandSource, longhandSource);
};

interface Conflict {
  line: number;
  message: string;
}

const conflictsIn = (sources: StyleSource[]): string[] => {
  const messages: string[] = [];
  for (const shorthandSource of sources) {
    for (const longhandSource of sources) {
      if (shorthandSource === longhandSource || !applyTogether(shorthandSource, longhandSource)) continue;
      for (const shorthand of shorthandSource.keys.keys()) {
        const longhands = LONGHANDS.get(shorthand);
        if (!longhands) continue;
        for (const longhand of longhandSource.keys.keys()) {
          if (!longhands.has(longhand) || !canDesync(shorthandSource, shorthand, longhandSource, longhand)) continue;
          messages.push(`${shorthandSource.name} sets ${shorthand} and ${longhandSource.name} sets ${longhand}`);
        }
      }
    }
  }
  return messages;
};

/** Every `style={...}` prop in a file whose merged objects mix a shorthand with one of its longhands. */
const findConflicts = (rawCode: string): { resolvedEntries: number; conflicts: Conflict[] } => {
  const code = rawCode.replaceAll('\r\n', '\n');
  const entries = styleEntries(code);
  const conflicts: Conflict[] = [];
  let resolvedEntries = 0;
  for (const match of code.matchAll(/\bstyle=\{/g)) {
    const open = match.index + match[0].length - 1;
    const sources = styleSources(code.slice(open + 1, closingIndex(code, open)), entries);
    resolvedEntries += sources.filter((source) => source.name !== 'inline').length;
    const line = code.slice(0, match.index).split('\n').length;
    for (const message of conflictsIn(sources)) conflicts.push({ line, message });
  }
  return { resolvedEntries, conflicts };
};

describe('style shorthand conflicts', () => {
  test('catches a variant style that adds a longhand on top of a shorthand', () => {
    const code = `
      <NavLink style={({ isActive }) => ({ ...styles.tab, ...(isActive && styles.tabLit), color: 'red' })} />;
      const styles = {
        tab: { flex: '1 1 0', height: '44px' },
        tabLit: { flexGrow: 2.6, padding: '0 12px' },
      };`;
    expect(findConflicts(code).conflicts.map((c) => c.message)).toEqual(['styles.tab sets flex and styles.tabLit sets flexGrow']);
  });

  test('catches a conditional inline object and a shorthand whose value changes', () => {
    const code = `
      <div style={{ ...styles.row, ...(wide ? { borderTopColor: 'red' } : {}) }} />;
      <div style={{ ...styles.cell, padding: wide ? '8px' : '4px' }} />;
      const styles = { row: { borderTop: '1px solid' }, cell: { paddingTop: '2px' } };`;
    expect(findConflicts(code).conflicts.map((c) => c.message)).toEqual([
      'styles.row sets borderTop and inline sets borderTopColor',
      'inline sets padding and styles.cell sets paddingTop',
    ]);
  });

  test('allows pairs that React keeps in sync', () => {
    const code = `
      <header style={{ ...styles.bar, borderBottomColor: theme.border }} />;
      <p style={notice ? { ...styles.tagline, flexGrow: 1 } : { ...styles.plain }} />;
      <i style={wide ? styles.narrow : { ...styles.stats, borderLeftColor: theme.border }} />;
      <b style={{ ...styles.chip, ...(first && styles.first) }} />;
      const styles = {
        bar: { borderBottom: '1px solid' },
        tagline: { color: 'red' },
        plain: { flex: 1 },
        narrow: { display: 'grid' },
        stats: { borderLeft: '1px solid' },
        chip: { border: '1px solid', borderColor: 'gray' },
        first: { borderColor: 'gold' },
      };`;
    expect(findConflicts(code).conflicts).toEqual([]);
  });

  test('no component mixes a shorthand with its longhand in a way React can desync', async () => {
    const found: string[] = [];
    let resolvedEntries = 0;
    for await (const path of new Glob('**/*.tsx').scan(import.meta.dir)) {
      const result = findConflicts(await Bun.file(`${import.meta.dir}/${path}`).text());
      resolvedEntries += result.resolvedEntries;
      for (const conflict of result.conflicts) found.push(`src/${path.replaceAll('\\', '/')}:${conflict.line} ${conflict.message}`);
    }
    expect(resolvedEntries).toBeGreaterThan(500);
    expect(found).toEqual([]);
  });
});
