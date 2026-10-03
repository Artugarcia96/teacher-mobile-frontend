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
