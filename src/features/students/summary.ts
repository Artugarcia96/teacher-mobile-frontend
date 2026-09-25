import type { HomeworkSummary, StudentCourse, StudentFile } from '../../api/types';
import { courseLabel, formatAverage, formatProposal, NOTE_KIND_LABEL, plural, shortDate, TERM_LABEL } from '../../lib/format';

/** "Deberes: todos hechos (6)" · "Deberes: no hizo 4 de 10 · 1 incompleto" (checks this school year, present only). */
export function homeworkText(h: HomeworkSummary | null | undefined): string | null {
  if (!h) return null;
  if (!h.not_done && !h.partial) return `Deberes: todos hechos (${h.checks})`;
  return `Deberes: no hizo ${h.not_done} de ${h.checks}${h.partial ? ` · ${plural(h.partial, 'incompleto', 'incompletos')}` : ''}`;
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

/** "Copiar resumen": fixed text (no AI) to paste into a message, an e-mail or the school platform.
 *
 *  Hugo Domínguez Marín
 *  Matemáticas · 2.º ESO B, 1.ª evaluación: media 5,3 · 9 faltas (2 justificadas) · 1 retraso · pendiente: Examen U2 (NP)
 *  Deberes: no hizo 4 de 10
 *  ("nota 6" when the teacher has set the term grade; "(N justificadas)" only when some are)
 *  Últimas observaciones:
 *  · 18 nov, incidencia: No trae el material por tercera vez.
 */
export function studentSummary(f: StudentFile): string {
  const lines = [f.student.name];
  for (const sc of f.courses) {
    const cell = sc.terms.find((t) => t.term === f.term);
    const grade = cell?.final != null ? `nota ${formatProposal(cell.final)}`
      : cell?.average != null ? `media ${formatAverage(cell.average)}` : 'sin notas';
    const parts = [
      grade,
      sc.absences + sc.justified + sc.lates ? attendanceText(sc).toLowerCase() : 'sin faltas',
      sc.pending_exams?.length
        ? `pendiente: ${sc.pending_exams.map((p) => (p.status === 'absent' ? `${p.title} (NP)` : p.title)).join(', ')}`
        : null,
    ].filter(Boolean);
    lines.push(`${courseLabel(sc.course)}, ${TERM_LABEL[f.term]}: ${parts.join(' · ')}`);
    const hw = homeworkText(sc.homework);
    if (hw) lines.push(hw);
  }
  const notes = f.notes.slice(0, 3);
  if (notes.length) {
    lines.push('Últimas observaciones:');
    for (const n of notes) lines.push(`· ${shortDate(n.date)}, ${NOTE_KIND_LABEL[n.kind].toLowerCase()}: ${n.text.replace(/\s+/g, ' ').trim()}`);
  }
  return lines.join('\n');
}
