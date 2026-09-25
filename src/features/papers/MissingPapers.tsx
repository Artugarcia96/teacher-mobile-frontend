import type { ActivityDetail } from '../../api/activities';
import type { Correction, CorrectionStudent } from '../../api/papers';
import type { StudentRef } from '../../api/types';
import { List, Row } from '../../ui';

const FINAL = ['confirmed', 'absent', 'exempt'];

/** Students with a repeat exam of this one scheduled: their grade goes there, they are not missing from this pile. */
export function repeatCovered(detail: ActivityDetail | undefined): ReadonlySet<string> {
  return new Set((detail?.repeats ?? []).flatMap((r) => r.student_ids ?? []));
}

/** Students without a paper and without a grade yet (NP or typed by hand): who is missing from the pile. Those with a
 * repeat exam (`covered`) are left out. */
export function missingStudents(c: Correction, covered: ReadonlySet<string> = new Set()): StudentRef[] {
  return c.students
    .filter((s: CorrectionStudent) => !s.paper_id && !FINAL.includes(s.grade?.status ?? '') && !covered.has(s.student.id))
    .map((s) => s.student);
}

/** "Pérez, Ruiz, Gil" by first surname; when two students of the class share one, "Carmen Cortés y Hugo Domínguez"
 * (first name and surname for everyone: a lone surname next to a full name reads as a double surname); "y 3 más". */
export function missingNames(missing: StudentRef[], everyone: StudentRef[]): string {
  const surname = (s: StudentRef) => s.last_name.split(' ')[0] || s.first_name;
  const shared = missing.some((s) => everyone.filter((x) => surname(x) === surname(s)).length > 1);
  const names = missing.map((s) => (shared ? `${s.first_name} ${surname(s)}` : surname(s)));
  if (names.length > 4) return `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`;
  return shared && names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names.join(', ');
}

/** "24 de 26 hojas recibidas · Faltan Pérez, Ruiz" → the sheet to put NP or schedule a repeat exam. */
export function MissingPapersRow({ correction, covered, onOpen }: { correction: Correction; covered: ReadonlySet<string>; onOpen: () => void }) {
  const missing = missingStudents(correction, covered);
  if (!correction.stats.papers || !missing.length) return null;
  const everyone = correction.students.map((s) => s.student);
  const received = correction.students.filter((s) => s.paper_id).length;
  return (
    <List>
      <Row title={`${received} de ${everyone.length} hojas recibidas`} wrapSub onClick={onOpen}
        sub={`${missing.length === 1 ? 'Falta' : 'Faltan'} ${missingNames(missing, everyone)}`}
        trail={<span className="missing-action">NP o repesca</span>} />
    </List>
  );
}
