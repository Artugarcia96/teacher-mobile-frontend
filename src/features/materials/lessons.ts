import type { Archetypes, LessonKind } from '../../api/content';
import type { LessonInfo } from '../../api/units';
import { plural } from '../../lib/format';

/** «Tipo de sesión» (the server's labels win when the slot table is loaded; lengua says «Comentario de texto»). */
const KIND_LABEL: Record<LessonKind, string> = {
  nueva: 'Nueva', problemas: 'Problemas', fuentes: 'Comentario de fuentes', laboratorio: 'Laboratorio', repaso: 'Repaso',
};

export const LESSON_KINDS: LessonKind[] = ['nueva', 'problemas', 'fuentes', 'laboratorio', 'repaso'];

export function lessonKindLabel(kind: LessonKind, family = '', table?: Archetypes): string {
  const byFamily = table?.lesson_kinds.labels_by_family[family]?.[kind];
  if (byFamily) return byFamily;
  if (family === 'lengua' && kind === 'fuentes') return 'Comentario de texto';
  return table?.lesson_kinds.labels[kind] ?? KIND_LABEL[kind];
}

/** «Nueva · 55 min». */
export function lessonLine(l: Pick<LessonInfo, 'kind' | 'minutes'>, family = '', table?: Archetypes): string {
  return `${lessonKindLabel(l.kind, family, table)} · ${l.minutes} min`;
}

/** The unit page's row: «Presentación · 5 sesiones», or «Presentación · 2 de 5 sesiones listas» while it is written. */
export function lessonsCount(m: { lessons_total: number; lessons_ready: number }): string {
  if (!m.lessons_total) return '';
  if (m.lessons_ready < m.lessons_total) return `${m.lessons_ready} de ${plural(m.lessons_total, 'sesión lista', 'sesiones listas')}`;
  return plural(m.lessons_total, 'sesión', 'sesiones');
}

const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** The subject's family as the server names it (backend content/sources.subject_family): only to show the default
 *  kinds of the lessons; the server decides what it writes. */
export function familyOf(subject: string): string {
  const s = plain(subject);
  if (/ingles|frances|aleman|italiano|portugues|english|french|german/.test(s)) return 'idioma';
  if (s.includes('matem')) return 'matematicas';
  if (/fisica|quimica|fyq/.test(s)) return 'fisica_quimica';
  if (/biolog|geolog|natural|ciencias|anatom/.test(s)) return 'ciencias';
  if (/historia|geograf|sociales/.test(s)) return 'sociales';
  if (/lengua|literatura|castellan/.test(s)) return 'lengua';
  return 'otra';
}

/** «primaria» | «eso» | «bachillerato» from the group's name («1.º Bach B»). */
export function stageOf(groupName: string): string {
  const s = plain(groupName);
  if (s.includes('bach')) return 'bachillerato';
  if (s.includes('prim') || /\bep\b/.test(s)) return 'primaria';
  return 'eso';
}

/** The class's most frequent slot length in minutes (55 without a timetable): «Duración de la clase». */
export function slotMinutes(schedule: { start: string; end: string }[]): number {
  const minutes = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const count = new Map<number, number>();
  for (const s of schedule) {
    const d = minutes(s.end) - minutes(s.start);
    if (d > 0) count.set(d, (count.get(d) ?? 0) + 1);
  }
  let best = 55, n = 0;
  for (const [d, c] of count) if (c > n || (c === n && d > best)) { best = d; n = c; }
  return best;
}

/** The kinds the server would give n lessons by default (the slot table's defaults), «nueva» when unknown. */
export function defaultKinds(table: Archetypes | undefined, family: string, stage: string, n: number): LessonKind[] {
  const kinds = table?.lesson_kinds.defaults[family]?.[stage]?.[String(n)];
  return kinds && kinds.length === n ? kinds : Array.from({ length: n }, () => 'nueva' as LessonKind);
}
