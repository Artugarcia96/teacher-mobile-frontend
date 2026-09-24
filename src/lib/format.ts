/** Spanish formatting helpers. Grades are never recalculated here — only formatted. */

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

export const TERM_LABEL: Record<number, string> = { 1: '1.ª evaluación', 2: '2.ª evaluación', 3: '3.ª evaluación', 4: 'Final' };
export const TERM_SHORT: Record<number, string> = { 1: '1.ª', 2: '2.ª', 3: '3.ª', 4: 'Final' };
export const WEEKDAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

/** Parse 'YYYY-MM-DD' as a local date (no timezone shift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week containing iso. */
export function mondayOf(iso: string): string {
  const d = parseDate(iso);
  const wd = (d.getDay() + 6) % 7;
  return addDays(iso, -wd);
}

/** "jueves, 19 de noviembre" */
export function longDate(iso: string): string {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** "19 nov" */
export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "19/11/2026" */
export function numericDate(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function weekdayShort(iso: string): string {
  return WEEKDAYS_SHORT[parseDate(iso).getDay()];
}

export function dayNumber(iso: string): number {
  return parseDate(iso).getDate();
}

/** "hoy", "mañana", "ayer", "el lunes", "19 nov" relative to `today`. */
export function relativeDay(iso: string, today: string): string {
  const diff = Math.round((parseDate(iso).getTime() - parseDate(today).getTime()) / 86400000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return 'mañana';
  if (diff === -1) return 'ayer';
  if (diff > 1 && diff < 7) return `el ${WEEKDAYS[parseDate(iso).getDay()]}`;
  return shortDate(iso);
}

/** 6.5 → "6,5"; 7 → "7"; null → "—" */
export function formatGrade(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const rounded = Math.round(v * 10 ** digits) / 10 ** digits;
  return String(rounded).replace('.', ',');
}

export function formatNumber(v: number | null | undefined, digits = 1): string {
  return formatGrade(v, digits);
}

export function formatPercent(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${Math.round(v)} %`;
}

/** Tone for a 0-10 value: fail < 5 ≤ pass < 7 ≤ good < 9 ≤ great. */
export function gradeTone(v: number | null | undefined): 'fail' | 'pass' | 'good' | 'great' | 'none' {
  if (v === null || v === undefined) return 'none';
  if (v < 5) return 'fail';
  if (v < 7) return 'pass';
  if (v < 9) return 'good';
  return 'great';
}

export const QUALITATIVE: Record<string, string> = { IN: 'Insuficiente', SU: 'Suficiente', BI: 'Bien', NT: 'Notable', SB: 'Sobresaliente' };

/** Parse a grade typed by a teacher: "6,5", "6.5", "6'5" → 6.5; "" → null; "NP" → 'NP'. */
export function parseGradeInput(raw: string): number | null | 'NP' | undefined {
  const s = raw.trim().replace(',', '.').replace("'", '.');
  if (s === '') return null;
  if (/^np$/i.test(s)) return 'NP';
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const KIND_LABEL: Record<string, string> = {
  exam: 'Examen', worksheet: 'Ficha', task: 'Trabajo', oral: 'Oral', notebook: 'Cuaderno', attitude: 'Actitud', other: 'Otra',
};

export const NOTE_KIND_LABEL: Record<string, string> = {
  observation: 'Observación', incident: 'Incidencia', positive: 'Positivo', family: 'Familia',
};
