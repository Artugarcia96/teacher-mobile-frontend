import { useEffect, useState } from 'react';

/** True once `key` has stayed the same for `ms`: an action that moves on to the next item cannot take a second tap meant for the previous one. */
export function useSettled(key: string, ms = 700): boolean {
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(key), ms);
    return () => window.clearTimeout(t);
  }, [key, ms]);
  return settled === key;
}
