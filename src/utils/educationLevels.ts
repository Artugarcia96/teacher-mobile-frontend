import type { EducationLevel } from '../types';

/** Tuple format: [value, label, ageRange] — used by chip-based selectors */
export const EDUCATION_LEVEL_OPTIONS: [EducationLevel, string, string][] = [
  ['infantil', 'Infantil', '3-5'],
  ['primaria_lower', 'Primaria Inf.', '6-8'],
  ['primaria_upper', 'Primaria Sup.', '9-11'],
  ['secundaria', 'Secundaria', '12-15'],
  ['bachillerato', 'Bachillerato', '16-17'],
  ['universidad', 'Universidad', '18+'],
];

/** Object format: { value, label } — used by <Select> dropdowns */
export const EDUCATION_LEVELS_SELECT = [
  { value: 'infantil',       label: 'Infantil (3-5)' },
  { value: 'primaria_lower', label: 'Primaria (6-8)' },
  { value: 'primaria_upper', label: 'Primaria (9-11)' },
  { value: 'secundaria',     label: 'Secundaria (12-15)' },
  { value: 'bachillerato',   label: 'Bachillerato (16-17)' },
  { value: 'universidad',    label: 'Universidad' },
  { value: 'fp',             label: 'Formación Profesional' },
];
