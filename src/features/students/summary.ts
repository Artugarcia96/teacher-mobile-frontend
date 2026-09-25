import type { HomeworkSummary, StudentCourse } from '../../api/types';
import { plural } from '../../lib/format';

/** "Deberes: todos hechos (6)" · "Deberes: todos hechos (3) · 1 incompleto" · "Deberes: no hizo 4 de 10 · 1 incompleto"
 *  (checks this school year, present only). */
export function homeworkText(h: HomeworkSummary | null | undefined): string | null {
  if (!h) return null;
  const partial = h.partial ? ` · ${plural(h.partial, 'incompleto', 'incompletos')}` : '';
  return h.not_done ? `Deberes: no hizo ${h.not_done} de ${h.checks}${partial}` : `Deberes: todos hechos (${h.checks})${partial}`;
}

/** "9 faltas (2 justificadas) · 1 retraso" of the current term, or "Sin faltas ni retrasos". */
export function attendanceText(sc: StudentCourse): string {
  const total = sc.absences + sc.justified;
  const parts = [
    total && `${plural(total, 'falta', 'faltas')}${sc.justified ? ` (${plural(sc.justified, 'justificada', 'justificadas')})` : ''}`,
    sc.lates && plural(sc.lates, 'retraso', 'retrasos'),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Sin faltas ni retrasos';
}
