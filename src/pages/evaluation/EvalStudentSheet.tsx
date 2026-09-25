import { useState } from 'react';
import { absencesText, staleText, unreviewed, useSaveEvalRow, type EvalRow, type EvalRowInput, type Evaluation } from '../../api/evaluation';
import { useGradebook } from '../../api/gradebook';
import type { CourseDetail } from '../../api/types';
import AverageBreakdown from '../../features/grades/AverageBreakdown';
import { formatAverage, formatProposal } from '../../lib/format';
import { AIBadge, Button, Callout, Sheet, SkeletonList, Stepper, TextArea, useFeedback, useSettled } from '../../ui';

/** One student's grade and report comment. «Aceptar y siguiente» accepts the comment (with or without edits) and
 *  walks the class list; it waits an instant on each student, so a double tap never accepts the next one unseen.
 *  A comment written for another grade, or whose words name another one («un bien» with a 7), cannot be accepted
 *  until it is rewritten or redrafted. ✕ closes; with edits it asks before discarding them. */
export default function EvalStudentSheet({ course, data, index, onIndex, onRedraft }: {
  course: CourseDetail; data: Evaluation; index: number | null; onIndex: (i: number | null) => void;
  onRedraft: (studentId: string) => void;
}) {
  const row = index != null ? data.rows[index] : undefined;
  if (!row || index == null) return null;
  return <Editor key={row.student.id} course={course} data={data} row={row} index={index} onIndex={onIndex} onRedraft={onRedraft} />;
}

function Editor({ course, data, row, index, onIndex, onRedraft }: {
  course: CourseDetail; data: Evaluation; row: EvalRow; index: number; onIndex: (i: number | null) => void;
  onRedraft: (studentId: string) => void;
}) {
  const { toast, confirm } = useFeedback();
  const save = useSaveEvalRow(course.id, data.term);
  const settled = useSettled(row.student.id);
  const [opened] = useState(row); // the row as it was when the sheet opened: only what the teacher touches is sent
  // Untouched fields follow the server (an AI comment arriving while the sheet is open shows up here).
  const [gradeEdit, setGradeEdit] = useState<{ v: number | null } | null>(null);
  const [commentEdit, setCommentEdit] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState(false);
  const grade = gradeEdit ? gradeEdit.v : row.final_grade ?? row.proposed;
  const comment = commentEdit ?? row.comment ?? '';
  const last = index >= data.rows.length - 1;
  const aiDraft = commentEdit === null && unreviewed(row);
  const gradeChanged = !!gradeEdit && (grade === row.proposed ? null : grade) !== opened.final_grade;
  const commentChanged = commentEdit !== null && commentEdit.trim() !== (opened.comment ?? '');
  // An unreviewed AI draft whose grade changes here is redrafted on «Aceptar»; any other comment that says another
  // grade (saved, or with the grade set here) has to be rewritten or redrafted before it can be accepted.
  const redo = gradeChanged && aiDraft;
  const staleComment = !!row.comment && !commentChanged && !redo
    && (gradeEdit ? row.comment_grade != null && grade != null && grade !== row.comment_grade : row.comment_stale);
  // Its words name another grade than the saved one; with the grade changed here, the server checks on «Aceptar».
  const clash = !staleComment && !commentChanged && !gradeEdit ? row.comment_clash : null;

  const fields = (): EvalRowInput => ({
    ...(gradeChanged ? { final_grade: grade === row.proposed ? null : grade } : {}),
    ...(commentChanged ? { comment: comment.trim() || null } : {}),
  });

  /** Accept (the comment is reviewed: 'final') and go to `next`; an unreviewed AI draft whose grade changed is
   *  redrafted instead. Only the last «Aceptar» says so in a toast: a toast would cover the next comment. */
  const accept = (next: number | null) => {
    const body: EvalRowInput = { ...fields(), ...(!redo && comment.trim() && row.comment_status !== 'final' ? { comment_status: 'final' } : {}) };
    const go = () => onIndex(next);
    if (!Object.keys(body).length) { go(); return; }
    save.mutate({ studentId: row.student.id, ...body }, {
      onSuccess: () => {
        if (redo) onRedraft(row.student.id);
        if (next === null) {
          toast(redo ? `Nota guardada. La IA redacta de nuevo el comentario de ${row.student.first_name}.`
            : body.comment_status === 'final' ? `Aceptado: ${row.student.first_name}` : `Guardado: ${row.student.first_name}`);
        }
        go();
      },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const redraftComment = async () => {
    // Replacing an unreviewed AI draft loses nothing the teacher wrote or accepted: no question asked.
    const ok = aiDraft || await confirm({
      title: 'Redactar de nuevo el comentario',
      text: `La IA escribe un borrador nuevo con la nota ${formatProposal(grade)}. El comentario actual se sustituye.`,
      confirm: 'Redactar',
    });
    if (!ok) return;
    save.mutate({ studentId: row.student.id, ...fields(), comment: null }, {
      onSuccess: () => {
        setCommentEdit(null);
        setGradeEdit(null);
        onRedraft(row.student.id);
        toast(`La IA redacta el comentario de ${row.student.first_name}`);
      },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  // "Usar 8": drop the adjustment made before the recovery, in one tap.
  const applyRecovery = () => save.mutate({ studentId: row.student.id, final_grade: null }, {
    onSuccess: () => { toast(`${row.student.first_name}: cuenta la recuperación (${formatProposal(row.proposed)})`); setGradeEdit(null); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const sub = [
    `Media ${formatAverage(row.average)}`,
    row.proposed != null ? `propuesta ${row.proposed}${row.qualitative ? ` ${row.qualitative}` : ''}` : 'sin propuesta',
    absencesText(row),
  ].join(' · ');
  const rec = row.recovery;
  const nextIndex = last ? null : index + 1;

  return (
    <Sheet open onClose={() => onIndex(null)} dirty={gradeChanged || commentChanged}
      title={row.student.name} subtitle={`${index + 1} de ${data.rows.length} · ${sub}`}
      footer={staleComment || clash ? <>
        <Button variant="neutral" disabled>El comentario dice otra nota</Button>
        <Button onClick={redraftComment} loading={save.isPending}>Redactar de nuevo</Button>
      </> : (
        <Button full onClick={() => accept(nextIndex)} loading={save.isPending} disabled={!settled}>{last ? 'Aceptar' : 'Aceptar y siguiente'}</Button>
      )}>
      <div className="form">
        {row.stale_adjustment && (
          <Callout tone="warn">
            La nota ajustada ({formatProposal(row.final_grade)}) no incluye la recuperación ({formatProposal(row.proposed)}).{' '}
            <button type="button" className="link-btn" disabled={save.isPending} onClick={applyRecovery}>Usar {formatProposal(row.proposed)}</button>
          </Callout>
        )}
        {(rec || row.pending_exams.length > 0 || row.missing_grades.length > 0 || row.adapted) && (
          <div className="ev-sheet__facts">
            {rec && <span>Recuperación: {formatAverage(rec.score)} · la media pasa de {formatAverage(rec.before)} a {formatAverage(row.average)} ({formatProposal(rec.before_proposed)} → {formatProposal(row.proposed)} rec.)</span>}
            {row.pending_exams.length > 0 && <span className="ev-sheet__warn">Pendiente (faltó): {row.pending_exams.map((p) => p.title).join(', ')}</span>}
            {row.missing_grades.length > 0 && <span className="ev-sheet__warn">Sin nota que cuente: {row.missing_grades.map((p) => p.title).join(', ')}</span>}
            {row.adapted && <span>ACS: la nota y el comentario se refieren a su adaptación curricular.</span>}
          </div>
        )}
        <div className="ev-sheet__grade">
          <div>
            <div className="field__label">Nota</div>
            <div className="ev-sheet__hint">
              {grade === row.proposed ? 'Igual que la propuesta' : <>Ajustada · propuesta {formatProposal(row.proposed)}</>}
            </div>
            {grade !== row.proposed && row.proposed != null && (
              <div className="ev-sheet__hint"><Button size="sm" variant="plain" onClick={() => setGradeEdit({ v: row.proposed })}>Usar la propuesta</Button></div>
            )}
          </div>
          <div className="ev-sheet__stepper">
            {grade != null ? (
              <Stepper label="Nota" value={grade} min={1} max={10} onChange={(v) => setGradeEdit({ v })} />
            ) : (
              <Button size="sm" variant="tinted" onClick={() => setGradeEdit({ v: 5 })}>Poner nota</Button>
            )}
          </div>
        </div>
        <div>
          <Button size="sm" variant="plain" className="ev-sheet__toggle" aria-expanded={breakdown} onClick={() => setBreakdown(!breakdown)}>
            {breakdown ? 'Ocultar cómo se calcula' : 'Cómo se calcula'}
          </Button>
          {breakdown && <Breakdown course={course} term={data.term} studentId={row.student.id} />}
        </div>
        {staleComment && <Callout tone="warn">{staleText(row.comment_grade, grade)}. Corrígelo o redáctalo de nuevo.</Callout>}
        {clash && <Callout tone="warn">El comentario dice «{clash}» y la nota es un {formatProposal(grade)}. Corrígelo o redáctalo de nuevo.</Callout>}
        <TextArea label={<span className="ev-sheet__label">Comentario de boletín {aiDraft && <AIBadge />}</span>}
          value={comment} maxLength={2000} rows={5} grow onChange={(e) => setCommentEdit(e.target.value)}
          placeholder="Qué ha hecho bien, qué debe mejorar y una recomendación concreta." />
        {redo && <p className="ev-sheet__hint">Al aceptar, la IA redacta de nuevo este borrador con la nota {formatProposal(grade)}.</p>}
      </div>
    </Sheet>
  );
}

/** «Cómo se calcula»: the same breakdown as the Cuaderno's average sheet, for this student and term. */
function Breakdown({ course, term, studentId }: { course: CourseDetail; term: number; studentId: string }) {
  const gb = useGradebook(course.id, term);
  const row = gb.data?.term === term ? gb.data.students.find((s) => s.student.id === studentId) : undefined;
  if (gb.error) return <p className="muted">No se ha podido cargar el cálculo. {gb.error.message}</p>;
  if (!gb.data || !row) return <SkeletonList rows={3} />;
  return <div className="ev-sheet__breakdown"><AverageBreakdown row={row} data={gb.data} /></div>;
}
