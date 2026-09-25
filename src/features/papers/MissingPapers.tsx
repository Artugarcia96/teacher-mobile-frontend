import type { Correction, CorrectionStudent } from '../../api/papers';
import type { StudentRef } from '../../api/types';
import { formatScore, shortDate } from '../../lib/format';
import { List, Row } from '../../ui';

const FINAL = ['confirmed', 'absent', 'exempt'];

/** Students without a paper and without a grade yet (NP or typed by hand): who is missing from the pile. Those with a
 * repeat exam scheduled are left out unless `withRepeat` (the sheet to put NP lists them too). */
export function missingStudents(c: Correction, withRepeat = false): StudentRef[] {
  return c.students
    .filter((s: CorrectionStudent) => !s.paper_id && !FINAL.includes(s.grade?.status ?? '') && (withRepeat || !s.missed?.repeat_id))
    .map((s) => s.student);
}

/** "Candela: repesca el 1 dic", "Marcos: NP", "Iker: repesca, 6,5" — a student without a paper whose case is settled. */
function settled(s: CorrectionStudent): string | null {
  if (s.paper_id) return null;
  const who = s.student.first_name;
  if (s.grade?.status === 'absent') return `${who}: NP`;
  const rep = s.missed?.repeat_id ? s.missed : null;
  if (!rep) return null;
  const g = rep.repeat_grade;
  if (g?.status === 'absent') return `${who}: NP en la repesca`;
  if (g?.score != null) return `${who}: repesca, ${formatScore(g.score)}`;
  return `${who}: repesca el ${shortDate(rep.repeat_date!)}`;
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

/** "Faltan Pérez, Ruiz · Candela: repesca el 1 dic · Marcos: NP"; null when the pile is complete (or not scanned). */
export function missingText(c: Correction): string | null {
  if (!c.stats.papers) return null;
  const missing = missingStudents(c);
  const everyone = c.students.map((s) => s.student);
  const parts = [missing.length ? `${missing.length === 1 ? 'Falta' : 'Faltan'} ${missingNames(missing, everyone)}` : null,
    ...c.students.map(settled)].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "24 de 26 hojas recibidas · Faltan Pérez, Ruiz · Candela: repesca el 1 dic · Marcos: NP" → the sheet to put NP or
 * schedule a repeat exam. It stays once everyone is settled: who missed the exam and what was done. */
export function MissingPapersRow({ correction, onOpen }: { correction: Correction; onOpen: () => void }) {
  const sub = missingText(correction);
  if (!sub) return null;
  const missing = missingStudents(correction);
  const everyone = correction.students.map((s) => s.student);
  const received = correction.students.filter((s) => s.paper_id).length;
  return (
    <List>
      <Row title={`${received} de ${everyone.length} hojas recibidas`} wrapSub onClick={onOpen} sub={sub}
        trail={missing.length ? <span className="missing-action">NP o repesca</span> : undefined} />
    </List>
  );
}
