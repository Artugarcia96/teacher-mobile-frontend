import type { StudentFile } from '../../api/types';
import { courseLabel, formatAverage, formatProposal, NOTE_KIND_LABEL, plural, shortDate, TERM_LABEL } from '../../lib/format';

/** "Copiar resumen": fixed text (no AI) to paste into a message, an e-mail or the school platform.
 *
 *  Hugo Domínguez Marín
 *  Matemáticas · 2.º ESO B: media 5,3 en la 1.ª evaluación · 9 faltas (2 justificadas) · 1 retraso · pendiente: Examen U2 (NP)
 *  ("nota 6" when the teacher has set the term grade; "(N justificadas)" only when some are)
 *  Últimas observaciones:
 *  · 18 nov, incidencia: No trae el material por tercera vez.
 */
export function studentSummary(f: StudentFile, term: number): string {
  const lines = [f.student.name];
  for (const sc of f.courses) {
    const cell = sc.terms.find((t) => t.term === term);
    const grade = cell?.final != null ? `nota ${formatProposal(cell.final)}`
      : cell?.average != null ? `media ${formatAverage(cell.average)}` : null;
    const total = sc.absences + sc.justified;
    const parts = [
      grade ? `${grade} en la ${TERM_LABEL[term]}` : `sin notas en la ${TERM_LABEL[term]}`,
      total ? `${plural(total, 'falta', 'faltas')}${sc.justified ? ` (${plural(sc.justified, 'justificada', 'justificadas')})` : ''}` : 'sin faltas',
      sc.lates ? plural(sc.lates, 'retraso', 'retrasos') : null,
      sc.pending_exams?.length
        ? `pendiente: ${sc.pending_exams.map((p) => (p.status === 'absent' ? `${p.title} (NP)` : p.title)).join(', ')}`
        : null,
    ].filter(Boolean);
    lines.push(`${courseLabel(sc.course)}: ${parts.join(' · ')}`);
  }
  const notes = f.notes.slice(0, 3);
  if (notes.length) {
    lines.push('Últimas observaciones:');
    for (const n of notes) lines.push(`· ${shortDate(n.date)}, ${NOTE_KIND_LABEL[n.kind].toLowerCase()}: ${n.text.replace(/\s+/g, ' ').trim()}`);
  }
  return lines.join('\n');
}
