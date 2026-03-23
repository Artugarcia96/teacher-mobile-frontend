import { useState, useEffect } from 'react';

const MQ = '(min-width: 992px)';

export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia(MQ).matches);
  useEffect(() => {
    const mql = window.matchMedia(MQ);
    const handler = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return desktop;
}
