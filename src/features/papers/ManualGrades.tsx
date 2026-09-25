import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { correctionKeys, useConfirmReview, type Correction, type CorrectionStudent } from '../../api/papers';
import { formatGrade, formatScore, parseGradeInput } from '../../lib/format';
import { Avatar, Chip, List, Row, Section, useFeedback } from '../../ui';

const shown = (s: CorrectionStudent) =>
  s.grade?.status === 'absent' ? 'NP' : s.grade?.status === 'confirmed' ? formatScore(s.grade.score) : '';

/** Plain grading list: one numeric box per student, Enter jumps to the next one. Saves on blur. `absent`: marked absent
 *  on the exam day and still without a grade ("Faltó"). */
export function ManualGrades({ correction, absent }: { correction: Correction; absent: ReadonlySet<string> }) {
  const { activity, students } = correction;
  const save = useConfirmReview(activity.id, activity.course.id);
  const { toast } = useFeedback();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (s: CorrectionStudent) => {
    const raw = draft[s.student.id];
    if (raw === undefined || raw === shown(s)) return;
    const v = parseGradeInput(raw);
    const reset = () => setDraft((d) => { const n = { ...d }; delete n[s.student.id]; return n; });
    if (v === null) { reset(); return; }
    if (v === undefined || (typeof v === 'number' && (v < 0 || v > activity.max_score))) {
      toast(`Escribe una nota entre 0 y ${formatGrade(activity.max_score)} o NP.`, { tone: 'error' });
      reset();
      return;
    }
    save.mutate({ studentId: s.student.id, ...(v === 'NP' ? { absent: true } : { score: v }) }, {
      onSuccess: ({ grade }) => {
        // Show the saved value at once; the background refetch confirms it.
        qc.setQueryData<Correction>(correctionKeys.one(activity.id), (old) => old && {
          ...old, students: old.students.map((x) => (x.student.id === s.student.id ? { ...x, grade } : x)),
        });
        reset();
      },
      onError: (e) => { toast(e.message, { tone: 'error' }); reset(); },
    });
  };

  const done = students.filter((s) => s.grade && ['confirmed', 'absent'].includes(s.grade.status)).length;

  return (
    <Section className="manual-grades" title={`Notas · ${done} de ${students.length}`}
      footer={`Nota sobre ${formatGrade(activity.max_score)}. Escribe NP si no se presentó. Se guarda al pasar a la siguiente casilla.`}>
      <List inset={64}>
        {students.map((s, i) => (
          <Row key={s.student.id} lead={<Avatar initials={s.student.initials} />} title={s.student.sort_name}
            sub={absent.has(s.student.id) ? <Chip tone="warn">Faltó</Chip> : undefined}
            trail={
              <input ref={(el) => { refs.current[i] = el; }} className="input grade-input num" inputMode="decimal" enterKeyHint="next"
                aria-label={`Nota de ${s.student.name}`} placeholder="—"
                value={draft[s.student.id] ?? shown(s)}
                onChange={(e) => setDraft((d) => ({ ...d, [s.student.id]: e.target.value }))}
                onFocus={(e) => e.target.select()}
                onBlur={() => commit(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); (refs.current[i + 1] ?? e.currentTarget).focus(); if (!refs.current[i + 1]) e.currentTarget.blur(); }
                }} />
            } />
        ))}
      </List>
    </Section>
  );
}
