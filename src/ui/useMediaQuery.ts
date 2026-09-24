import { useEffect, useState } from 'react';

/** Desktop layout breakpoint (docs/DESIGN.md §7). */
export const DESKTOP = '(min-width: 1024px)';

/** True while the media query matches (e.g. useMediaQuery(DESKTOP)). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
