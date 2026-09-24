import { useState } from 'react';
import { useSaveEvalRow, type EvalRow, type EvalRowInput, type Evaluation } from '../../api/evaluation';
import type { CourseDetail } from '../../api/types';
import { formatAverage, formatProposal, plural } from '../../lib/format';
import { AIBadge, Button, Callout, Sheet, Stepper, Switch, TextArea, useFeedback } from '../../ui';

/** Edit one student's final grade and report comment; "Guardar y siguiente" walks the class list. */
export default function EvalStudentSheet({ course, data, index, onIndex }: {
  course: CourseDetail; data: Evaluation; index: number | null; onIndex: (i: number | null) => void;
}) {
  const row = index != null ? data.rows[index] : undefined;
  if (!row || index == null) return null;
  return <Editor key={row.student.id} course={course} data={data} row={row} index={index} onIndex={onIndex} />;
}

function Editor({ course, data, row, index, onIndex }: {
  course: CourseDetail; data: Evaluation; row: EvalRow; index: number; onIndex: (i: number | null) => void;
}) {
  const { toast } = useFeedback();
  const save = useSaveEvalRow(course.id, data.term);
  const [grade, setGrade] = useState<number | null>(row.final_grade ?? row.proposed);
  const [comment, setComment] = useState(row.comment ?? '');
  const [isFinal, setIsFinal] = useState(row.comment_status === 'final');
  const last = index >= data.rows.length - 1;
  const aiDraft = row.comment_source === 'ai' && row.comment_status === 'draft' && comment === (row.comment ?? '');

  const body = (): EvalRowInput | null => {
    const out: EvalRowInput = {};
    const wanted = grade === row.proposed ? null : grade;
    if (wanted !== row.final_grade) out.final_grade = wanted;
    if (comment.trim() !== (row.comment ?? '')) out.comment = comment.trim() || null;
    const status = isFinal ? 'final' : (comment.trim() ? 'draft' : null);
    if (status !== row.comment_status && (status || row.comment_status)) out.comment_status = status;
    return Object.keys(out).length ? out : null;
  };

  const submit = (next: boolean) => {
    const b = body();
    const go = () => onIndex(next && !last ? index + 1 : null);
    if (!b) { go(); return; }
    if (isFinal && !comment.trim()) { toast('Escribe un comentario antes de marcarlo como definitivo', { tone: 'error' }); return; }
    save.mutate({ studentId: row.student.id, ...b }, {
      onSuccess: () => { toast(`Guardado: ${row.student.first_name}`); go(); },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  // "Usar 8": drop the adjustment made before the recovery, in one tap.
  const applyRecovery = () => save.mutate({ studentId: row.student.id, final_grade: null }, {
    onSuccess: () => { toast(`${row.student.first_name}: cuenta la recuperación (${formatProposal(row.proposed)})`); setGrade(row.proposed); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const sub = [
    `Media ${formatAverage(row.average)}`,
    row.proposed != null ? `propuesta ${row.proposed}${row.qualitative ? ` ${row.qualitative}` : ''}` : 'sin propuesta',
    plural(row.absences, 'falta', 'faltas'),
  ].join(' · ');
  const rec = row.recovery;

  return (
    <Sheet open onClose={() => onIndex(null)} title={row.student.name} subtitle={`${index + 1} de ${data.rows.length} · ${sub}`}
      footer={<>
        <Button variant="neutral" onClick={() => submit(false)} disabled={save.isPending}>Guardar</Button>
        {!last && <Button onClick={() => submit(true)} loading={save.isPending}>Guardar y siguiente</Button>}
      </>}>
      <div className="form">
        {row.stale_adjustment && (
          <Callout tone="warn">
            La nota ajustada ({formatProposal(row.final_grade)}) no incluye la recuperación ({formatProposal(row.proposed)}).{' '}
            <Button size="sm" variant="plain" loading={save.isPending} onClick={applyRecovery}>Usar {formatProposal(row.proposed)}</Button>
          </Callout>
        )}
        {(rec || row.pending_exams.length > 0 || row.adapted) && (
          <div className="ev-sheet__facts">
            {rec && <span>Recuperación: {formatAverage(rec.score)} · la media pasa de {formatAverage(rec.before)} a {formatAverage(row.average)} ({formatProposal(rec.before_proposed)} → {formatProposal(row.proposed)} rec.)</span>}
            {row.pending_exams.length > 0 && <span>Pendiente (faltó): {row.pending_exams.map((p) => p.title).join(', ')}</span>}
            {row.adapted && <span>ACS: la nota y el comentario se refieren a su adaptación curricular.</span>}
          </div>
        )}
        <div className="ev-sheet__grade">
          <div>
            <div className="field__label">Nota final</div>
            <div className="ev-sheet__hint">
              {grade === row.proposed ? 'Igual que la propuesta' : <>Ajustada · propuesta {formatProposal(row.proposed)}</>}
            </div>
            {grade !== row.proposed && row.proposed != null && (
              <div className="ev-sheet__hint"><Button size="sm" variant="plain" onClick={() => setGrade(row.proposed)}>Usar la propuesta</Button></div>
            )}
          </div>
          <div className="ev-sheet__stepper">
            {grade != null ? (
              <Stepper label="Nota final" value={grade} min={1} max={10} onChange={setGrade} />
            ) : (
              <Button size="sm" variant="tinted" onClick={() => setGrade(5)}>Poner nota</Button>
            )}
          </div>
        </div>
        <TextArea label={<span className="ev-sheet__label">Comentario de boletín {aiDraft && <AIBadge />}</span>}
          value={comment} maxLength={2000} rows={5} onChange={(e) => setComment(e.target.value)}
          placeholder="Qué ha hecho bien, qué debe mejorar y una recomendación concreta." />
        <label className="ev-sheet__switch">
          <span>
            <b>Comentario definitivo</b>
            <span className="ev-sheet__hint">La IA no lo volverá a cambiar.</span>
          </span>
          <Switch label="Comentario definitivo" checked={isFinal} onChange={setIsFinal} />
        </label>
      </div>
    </Sheet>
  );
}
