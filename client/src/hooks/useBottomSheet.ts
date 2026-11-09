import { useEffect, useRef } from 'react';

/** Focuses the sheet's close button, closes on Escape and keeps the page behind from scrolling. */
export function useBottomSheet(onClose: () => void) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // The page refetches while the sheet is open; keep the effect from re-running.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  return closeRef;
}
