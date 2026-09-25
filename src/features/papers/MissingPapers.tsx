import type { Correction, CorrectionStudent } from '../../api/papers';
import type { StudentRef } from '../../api/types';
import { List, Row } from '../../ui';

const FINAL = ['confirmed', 'absent', 'exempt'];

/** Students without a paper and without a grade yet (NP or typed by hand): who is missing from the pile. */
export function missingStudents(c: Correction): StudentRef[] {
  return c.students.filter((s: CorrectionStudent) => !s.paper_id && !FINAL.includes(s.grade?.status ?? '')).map((s) => s.student);
}

/** "Pérez, Ruiz, Gil" by first surname (the first name too when two students of the class share it; never joined with
 * "y", which reads as a double surname); "y 3 más". */
export function missingNames(missing: StudentRef[], everyone: StudentRef[]): string {
  const surname = (s: StudentRef) => s.last_name.split(' ')[0] || s.first_name;
  const shared = (s: StudentRef) => everyone.filter((x) => surname(x) === surname(s)).length > 1;
  const names = missing.map((s) => (shared(s) ? `${s.first_name} ${surname(s)}` : surname(s)));
  return names.length > 4 ? `${names.slice(0, 3).join(', ')} y ${names.length - 3} más` : names.join(', ');
}

/** "24 de 26 hojas recibidas · Faltan Pérez, Ruiz" → the sheet to put NP or schedule a repeat exam. */
export function MissingPapersRow({ correction, onOpen }: { correction: Correction; onOpen: () => void }) {
  const missing = missingStudents(correction);
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
