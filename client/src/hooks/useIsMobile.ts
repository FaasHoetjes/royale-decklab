import { useEffect, useState } from 'react';

// Tracks whether the viewport is phone-sized. The app's styles are inline
// (CSS-in-JS), so plain CSS media queries can't reach them — branching on this
// flag is the idiomatic way to make a component responsive here. Used to swap
// the desktop side column for a top bar and to tighten paddings on small screens.
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return isMobile;
}
