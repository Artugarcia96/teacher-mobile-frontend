/**
 * Centralized period (trimester / cuatrimester) configuration.
 * All components should use these helpers instead of hardcoding [1,2,3].
 */

export type PeriodMode = 'trimester' | 'cuatrimester';

/** Period numbers for the given mode. */
export function getPeriodNumbers(mode?: PeriodMode | null): number[] {
  return mode === 'cuatrimester' ? [1, 2] : [1, 2, 3];
}

/** Short label: "T1" / "C1" */
export function getPeriodLabel(mode: PeriodMode | undefined | null, n: number): string {
  return mode === 'cuatrimester' ? `C${n}` : `T${n}`;
}

/** Full label: "1er Trimestre" / "1er Cuatrimestre" */
export function getPeriodFullLabel(mode: PeriodMode | undefined | null, n: number): string {
  const term = mode === 'cuatrimester' ? 'Cuatrimestre' : 'Trimestre';
  if (n === 1) return `1er ${term}`;
  if (n === 2) return `2º ${term}`;
  return `3er ${term}`;
}

/** Singular noun: "trimestre" / "cuatrimestre" */
export function getPeriodNoun(mode?: PeriodMode | null): string {
  return mode === 'cuatrimester' ? 'cuatrimestre' : 'trimestre';
}

/** Colors per period number — works for both modes */
export const PERIOD_COLORS: Record<number, string> = {
  1: '#15665E',
  2: '#E87A1C',
  3: '#6366F1',
};
