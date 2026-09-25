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

/** "martes, 8 sept 2026" — date fields (DateField), where the year matters. */
export function dateWithYear(iso: string): string {
  const d = parseDate(iso);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
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

/** Number with Spanish decimal comma, up to `digits` decimals: 6.5 → "6,5"; 7 → "7"; null → "—".
 *  Half up on the decimal value, like the backend (`services/text.one_decimal`): 4.25 → "4,3", 4.35 → "4,4"
 *  (plain Math.round(4.35 * 10) gives 43 because 4.35 * 10 = 43.4999…).
 *  Grades use the three rules below; call this directly only for other numbers (weights, points, maximum scores). */
export function formatGrade(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return String(roundHalfUp(v, digits)).replace('.', ',');
}

function roundHalfUp(v: number, digits: number): number {
  const scaled = Number((Math.abs(v) * 10 ** digits).toPrecision(12));
  const rounded = (Math.sign(v) * Math.round(scaled)) / 10 ** digits;
  return rounded === 0 ? 0 : rounded;
}

/** Rule 1 — averages (evaluación, categoría, clase, final): always one decimal. 6.875 → "6,9"; 7 → "7,0". */
export function formatAverage(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return roundHalfUp(v, 1).toFixed(1).replace('.', ',');
}

/** Rule 2 — a grade as the teacher entered it (activity score): up to two decimals. 6.25 → "6,25". */
export function formatScore(v: number | null | undefined): string {
  return formatGrade(v, 2);
}

/** Rule 3 — proposed / final grade of an evaluación: integer. 6.5 → "7" (the backend already rounds). */
export function formatProposal(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? '—' : String(Math.round(v));
}

export function formatNumber(v: number | null | undefined, digits = 1): string {
  return formatGrade(v, digits);
}

/** A whole percentage the backend already rounded (`grading.percent`, the same figure as the acta): only printed. */
export function formatPercent(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : `${v} %`;
}

export type GradeTone = 'fail' | 'pass' | 'great' | 'none';

/** Tone for a 0-10 value, three states only: fail (< 5, rojo) · pass (5–8,9, tinta) · great (≥ 9, acento). */
export function gradeTone(v: number | null | undefined): GradeTone {
  if (v === null || v === undefined || Number.isNaN(v)) return 'none';
  if (v < 5) return 'fail';
  if (v < 9) return 'pass';
  return 'great';
}

/** Ordinal abbreviations with a period (RAE): "2º ESO B", "2°ESO B" → "2.º ESO B"; "1ª evaluación" → "1.ª evaluación".
 *  Group names come as the teacher typed them: always show them through this. */
export function ordinals(text: string): string {
  return text
    .replace(/(\d)\s*\.?\s*([ºª°])/g, (_, n: string, o: string) => `${n}.${o === 'ª' ? 'ª' : 'º'}`)
    .replace(/(\d\.[ºª])(?=[A-Za-zÁÉÍÓÚÑáéíóúñ0-9])/g, '$1 ');
}

interface CourseNames { subject: string; short?: string | null; group: { name: string } }

/** "Matemáticas · 2.º ESO B" */
export function courseLabel(c: CourseNames): string {
  return `${c.subject} · ${ordinals(c.group.name)}`;
}

/** "2.º ESO B · Mates": group first so long subjects never hide it (sidebar, compact lists). */
export function courseShortLabel(c: CourseNames): string {
  return `${ordinals(c.group.name)} · ${c.short || c.subject}`;
}

/** The session is running now (server "today" and "now"). */
export function isLive(s: { date: string; start: string; end: string } | null | undefined, today: string, now?: string | null): boolean {
  return !!s && !!now && s.date === today && s.start <= now && now < s.end;
}

/** Current or next session, one short phrase: "En clase hasta 11:15" · "Hoy 12:40" · "Mañana 11:45" · "Lunes 23 nov, 08:30".
 *  Same text in Clases and in the class header. */
export function sessionText(s: { date: string; start: string; end: string } | null | undefined, today: string, now?: string | null): string | null {
  if (!s) return null;
  if (isLive(s, today, now)) return `En clase hasta ${s.end}`;
  const diff = Math.round((parseDate(s.date).getTime() - parseDate(today).getTime()) / 86400000);
  if (diff === 0) return `Hoy ${s.start}`;
  if (diff === 1) return `Mañana ${s.start}`;
  const d = parseDate(s.date);
  const wd = WEEKDAYS[d.getDay()];
  return `${wd[0].toUpperCase()}${wd.slice(1)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${s.start}`;
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

/** Lowercase without accents ("Raíces" → "raices"), to compare what the teacher typed. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const KIND_LABEL: Record<string, string> = {
  exam: 'Examen', worksheet: 'Ficha', task: 'Trabajo', oral: 'Oral', notebook: 'Cuaderno', attitude: 'Actitud', other: 'Otra', homework: 'Deberes',
};

export const NOTE_KIND_LABEL: Record<string, string> = {
  observation: 'Observación', incident: 'Incidencia', positive: 'Positivo', family: 'Familia',
};
