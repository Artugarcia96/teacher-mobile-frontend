import type { Measure, Support } from '../../api/types';

/** Adaptation measures, in the order the backend returns them. `label` for the editing sheet, `short` for chips. */
export const MEASURES: { key: Measure; label: string; short: string }[] = [
  { key: 'mas_tiempo', label: 'Más tiempo en los exámenes', short: 'Más tiempo' },
  { key: 'letra_ampliada', label: 'Letra ampliada', short: 'Letra ampliada' },
  { key: 'enunciados_por_pasos', label: 'Enunciados por pasos', short: 'Por pasos' },
  { key: 'lectura_en_voz_alta', label: 'Lectura de enunciados en voz alta', short: 'Lectura en voz alta' },
  { key: 'examen_adaptado', label: 'Examen adaptado', short: 'Examen adaptado' },
  { key: 'acs', label: 'Adaptación curricular significativa (ACS)', short: 'ACS' },
];

const SHORT = Object.fromEntries(MEASURES.map((m) => [m.key, m.short])) as Record<Measure, string>;

/** "NEAE" or "ACNEE" (no diagnosis): lists and search results, which teachers often project in class. */
export function supportFlag(s: Support | null | undefined): string | null {
  return s?.acnee ? 'ACNEE' : s?.neae ? 'NEAE' : null;
}

/** "NEAE · TDAH", "ACNEE", or null when the student has no mark. Only in the student file. */
export function supportLabel(s: Support | null | undefined): string | null {
  if (!s) return null;
  const parts = [s.acnee ? 'ACNEE' : s.neae ? 'NEAE' : null, s.kind || null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Short chip texts for the measures: ["Más tiempo", "Por pasos", "ACS 5.º Primaria"]. */
export function measureChips(s: Support | null | undefined): string[] {
  return (s?.measures ?? []).map((m) => (m === 'acs' && s?.acs_level ? `ACS ${s.acs_level}` : SHORT[m]));
}
