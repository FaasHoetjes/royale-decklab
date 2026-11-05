import { useEffect, useRef, useState } from 'react';

const HEADER_HEIGHT = 60;

/**
 * On phones, whether the build button in the card panel has scrolled up under the header while the end of the
 * deck list is still below, which is when the floating copy of it shows.
 */
export function usePastBuildButton(enabled: boolean) {
  const buttonRef = useRef<HTMLAnchorElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [pastButton, setPastButton] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    if (!enabled || !buttonRef.current || !endRef.current) return;
    const button = buttonRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === button) setPastButton(!entry.isIntersecting && entry.boundingClientRect.top < HEADER_HEIGHT);
          else setAtEnd(entry.isIntersecting);
        }
      },
      { rootMargin: `-${HEADER_HEIGHT}px 0px 0px 0px` }
    );
    observer.observe(button);
    observer.observe(endRef.current);
    return () => observer.disconnect();
  }, [enabled]);

  return { buttonRef, endRef, floating: enabled && pastButton && !atEnd };
}
