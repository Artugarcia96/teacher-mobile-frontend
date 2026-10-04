import type { Archetypes, LessonKind } from '../../api/content';
import type { LessonInfo } from '../../api/units';
import { plural } from '../../lib/format';

export const LESSON_KINDS: LessonKind[] = ['nueva', 'problemas', 'fuentes', 'laboratorio', 'repaso'];

/** «Tipo de sesión» as the server names it for the subject (the kind's key while the slot table loads). */
export function lessonKindLabel(kind: LessonKind, family = '', table?: Archetypes): string {
  return table?.lesson_kinds.labels_by_family[family]?.[kind] ?? table?.lesson_kinds.labels[kind] ?? kind;
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

/** The kinds the server would give n lessons by default (the slot table's defaults), «nueva» when unknown. */
export function defaultKinds(table: Archetypes | undefined, family: string, stage: string, n: number): LessonKind[] {
  const kinds = table?.lesson_kinds.defaults[family]?.[stage]?.[String(n)];
  return kinds && kinds.length === n ? kinds : Array.from({ length: n }, () => 'nueva' as LessonKind);
}
