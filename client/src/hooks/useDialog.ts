import { useEffect, useRef, useState, type RefObject } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

interface OpenDialog {
  ref: RefObject<HTMLElement>;
  opener: Element | null;
}

// Nested dialogs: only the innermost one handles Escape and Tab, and the page scrolls again once the last one closes.
const openDialogs: OpenDialog[] = [];
let overflowBeforeDialogs = '';

const isTabStop = (el: HTMLElement) => el.tabIndex >= 0 && el.getClientRects().length > 0;

const canTakeFocus = (el: Element | null): el is HTMLElement => el instanceof HTMLElement && el.isConnected;

function keepFocusIn(dialog: HTMLElement, e: KeyboardEvent) {
  const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isTabStop);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    e.preventDefault();
    return;
  }
  const active = document.activeElement;
  const isOutside = !(active instanceof Node) || !dialog.contains(active);
  if (e.shiftKey && (active === first || active === dialog || isOutside)) {
    e.preventDefault();
    last.focus();
    return;
  }
  if (!e.shiftKey && (active === last || isOutside)) {
    e.preventDefault();
    first.focus();
  }
}

/** What opened the dialog the element sits in, for a dialog that replaces the one it was opened from. */
function openerOfDialogAround(el: Element | null): Element | null {
  if (!el) return null;
  const around = openDialogs.find((d) => d.ref.current?.contains(el));
  return around?.opener ?? null;
}

/**
 * Makes an element behave as a modal dialog: focus moves in on open, Tab stays inside, Escape closes, the page
 * behind doesn't scroll, and focus returns to whatever opened it. The dialog element needs tabIndex={-1}.
 */
export function useDialog(ref: RefObject<HTMLElement>, onClose: () => void) {
  // Read during render: under StrictMode the effect runs twice, and the second run would see the dialog itself.
  const [opener] = useState(() => document.activeElement);
  const [fallbackOpener] = useState(() => openerOfDialogAround(opener));
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const entry: OpenDialog = { ref, opener };
    if (openDialogs.length === 0) {
      overflowBeforeDialogs = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    openDialogs.push(entry);
    dialog.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (openDialogs[openDialogs.length - 1] !== entry) return;
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab') keepFocusIn(dialog, e);
    };
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      openDialogs.splice(openDialogs.indexOf(entry), 1);
      if (openDialogs.length === 0) document.body.style.overflow = overflowBeforeDialogs;
      // Closing can open something else that takes focus, like the card picker; only hand back focus that was lost.
      const active = document.activeElement;
      const isFocusLost = active == null || active === document.body;
      if (!isFocusLost) return;
      const returnTo = [opener, fallbackOpener].find(canTakeFocus);
      returnTo?.focus({ preventScroll: true });
    };
  }, [ref, opener, fallbackOpener]);
}
