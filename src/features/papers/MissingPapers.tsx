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

/** A student by first name; when two of the class share it, with the initial of the surname ("Rubén C."). */
function firstName(s: StudentRef, everyone: StudentRef[]): string {
  const shared = everyone.filter((x) => x.first_name === s.first_name).length > 1;
  return shared && s.last_name ? `${s.first_name} ${s.last_name[0]}.` : s.first_name;
}

/** "Candela: repesca el 1 dic", "Marcos: NP", "Iker: repesca, 6,5" — a student without a paper whose case is settled. */
function settled(s: CorrectionStudent, everyone: StudentRef[]): string | null {
  if (s.paper_id) return null;
  const who = firstName(s.student, everyone);
  if (s.grade?.status === 'absent') return `${who}: NP`;
  const rep = s.missed?.repeat_id ? s.missed : null;
  if (!rep) return null;
  const g = rep.repeat_grade;
  if (g?.status === 'absent') return `${who}: NP en la repesca`;
  if (g?.score != null) return `${who}: repesca, ${formatScore(g.score)}`;
  return `${who}: repesca el ${shortDate(rep.repeat_date!)}`;
}

/** "Paula", "Paula y Hugo", "Paula, Hugo, Ana y 3 más": first names, as in the rest of the row. */
export function missingNames(missing: StudentRef[], everyone: StudentRef[]): string {
  const names = missing.map((s) => firstName(s, everyone));
  if (names.length > 4) return `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0] ?? '';
}

/** "Paula: pendiente · Candela: repesca el 1 dic · Marcos: NP"; null when the pile is complete (or not scanned). */
export function missingText(c: Correction): string | null {
  if (!c.stats.papers) return null;
  const missing = missingStudents(c);
  const everyone = c.students.map((s) => s.student);
  const parts = [missing.length ? `${missingNames(missing, everyone)}: ${missing.length === 1 ? 'pendiente' : 'pendientes'}` : null,
    ...c.students.map((s) => settled(s, everyone))].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "24 de 26 hojas recibidas · Paula: pendiente · Candela: repesca el 1 dic · Marcos: NP" → the sheet to put NP or
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
