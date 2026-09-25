import type { Unit } from '../../api/units';
import { fold } from '../../lib/format';

/** The unit an activity is about: the one linked to it, else the one whose title appears in the activity's title
 * ("Examen U3 · Potencias y raíces"), else the one in progress. */
export function unitFor(units: Unit[], title: string, linked: string[] = []): string | null {
  const own = linked.find((id) => units.some((u) => u.id === id));
  if (own) return own;
  const t = fold(title);
  const named = units.filter((u) => fold(u.title).trim().length >= 3 && t.includes(fold(u.title).trim()))
    .sort((a, b) => b.title.length - a.title.length)[0];
  return named?.id ?? units.find((u) => u.status === 'current')?.id ?? null;
}
