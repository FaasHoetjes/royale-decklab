import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { copyText } from './clipboard';

describe('copyText', () => {
  let navigatorDescriptor: PropertyDescriptor | undefined;
  let documentDescriptor: PropertyDescriptor | undefined;
  let clipboardWorks: boolean;
  let fallbackWorks: boolean;
  let fallbackThrows: boolean;
  const remove = mock(() => {});
  const execCommand = mock(() => {
    if (fallbackThrows) throw new Error('Copy unavailable');
    return fallbackWorks;
  });

  beforeEach(() => {
    navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
    clipboardWorks = true;
    fallbackWorks = true;
    fallbackThrows = false;
    remove.mockClear();
    execCommand.mockClear();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      clipboard: { writeText: async () => { if (!clipboardWorks) throw new Error('Clipboard unavailable'); } },
    } });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: () => ({ style: {}, select: () => {}, remove }),
      body: { appendChild: () => {} },
      execCommand,
    } });
  });

  afterEach(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  test('reports a successful clipboard write', async () => {
    expect(await copyText('deck link')).toBe(true);
    expect(execCommand).not.toHaveBeenCalled();
  });

  test('uses the fallback when clipboard access fails', async () => {
    clipboardWorks = false;
    expect(await copyText('deck link')).toBe(true);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('reports failure when the fallback returns false', async () => {
    clipboardWorks = false;
    fallbackWorks = false;
    expect(await copyText('deck link')).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  test('reports failure and removes the temporary element if the fallback throws', async () => {
    clipboardWorks = false;
    fallbackThrows = true;
    expect(await copyText('deck link')).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
