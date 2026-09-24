/** «Revisar deberes»: todos hechos por defecto; tocar = sin hacer, otro toque = incompleto, otro = hecho. Guardado automático.
 *  Quien faltó ese día no cuenta. Cada guardado recalcula la nota sugerida «Deberes» de la evaluación en el cuaderno. */
import { useQueryClient } from '@tanstack/react-query';
import { WarningCircle } from '@phosphor-icons/react';
import { Fragment, useEffect, useState } from 'react';
import { HOMEWORK_LABEL, invalidateHomework, useHomeworkCheck, useSaveHomeworkCheck, type HomeworkStatus } from '../../api/sessions';
import { plural } from '../../lib/format';
import { Button, Sheet, SkeletonList, useFeedback } from '../../ui';
import { RosterList, SAVE_LABEL, useAutosave } from '../attendance/RosterList';

export interface HomeworkCheckSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  label?: string;
}

type Marks = Record<string, HomeworkStatus>;

const NEXT: Record<HomeworkStatus, HomeworkStatus> = { done: 'not_done', not_done: 'partial', partial: 'done' };
const LABEL = { ...HOMEWORK_LABEL, absent: 'Faltó' };
const TONE = { done: 'muted', not_done: 'danger', partial: 'warn', absent: 'muted' } as const;

export default function HomeworkCheckSheet(props: HomeworkCheckSheetProps) {
  if (!props.open) return null;
  return <HomeworkBody key={`${props.courseId}|${props.date}|${props.start}`} {...props} />;
}

function HomeworkBody({ onClose, courseId, date, start, label }: HomeworkCheckSheetProps) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const q = useHomeworkCheck(courseId, date, start);
  const save = useSaveHomeworkCheck(courseId);
  const [marks, setMarks] = useState<Marks | null>(null);
  const autosave = useAutosave((m: Marks) => save.mutateAsync({
    date, start, marks: Object.entries(m).filter(([, st]) => st !== 'done').map(([student_id, status]) => ({ student_id, status })),
  }));

  useEffect(() => {
    if (marks || !q.data) return;
    setMarks(Object.fromEntries(q.data.students.map((r) => [r.student.id, r.status])));
  }, [q.data, marks]);

  const present = (q.data?.students ?? []).filter((r) => !r.absent);
  const counts = { done: 0, not_done: 0, partial: 0 };
  for (const r of present) if (marks) counts[marks[r.student.id]]++;
  const summary = [plural(counts.done, 'hecho', 'hechos'), plural(counts.not_done, 'sin hacer', 'sin hacer'),
    counts.partial > 0 && plural(counts.partial, 'incompleto', 'incompletos')].filter(Boolean).join(' · ');
  const names = marks ? ([['not_done', 'Sin hacer'], ['partial', 'Incompletos']] as const).flatMap(([st, text]) => {
    const who = present.filter((r) => marks[r.student.id] === st).map((r) => r.student.sort_name);
    return who.length ? [{ st, text, who: who.join('; ') }] : [];
  }) : [];

  const finish = async (explicit: boolean) => {
    const needsSave = autosave.isDirty() || (explicit && !q.data?.checked);
    if (needsSave && marks && !(await autosave.flush(marks))) {
      toast('No se ha podido guardar la revisión. Revisa la conexión y vuelve a intentarlo.', { tone: 'error' });
      return;
    }
    invalidateHomework(qc, courseId);
    if (explicit || needsSave || autosave.state === 'saved') toast(`Deberes revisados · ${summary}`);
    onClose();
  };

  return (
    <Sheet open side size="large" onClose={() => void finish(false)} title={label ? `Deberes · ${label}` : 'Revisar deberes'}
      subtitle={
        <span className="roster-head">
          <span className="roster-head__meta">
            <span>{q.data ? q.data.homework || 'Deberes de la última clase' : ' '}</span>
            {autosave.state !== 'idle' && <span className={autosave.state === 'error' ? 'roster-head__err' : 'faint'}>{SAVE_LABEL[autosave.state]}</span>}
          </span>
          {marks && <span className="roster-head__sum num">{summary}</span>}
          {names.length > 0 && (
            <span className="roster-head__names">
              {names.map((n, i) => <Fragment key={n.st}>{i > 0 && ' · '}{n.text}: <b>{n.who}</b></Fragment>)}
            </span>
          )}
          <span className="roster-head__hint"><span className="roster-head__do">Toca a quien no los haya hecho. Otro toque: incompletos.</span> Quien faltó no cuenta.</span>
        </span>
      }
      footer={<Button full onClick={() => void finish(true)} disabled={!marks}>Terminar revisión</Button>}>
      <span tabIndex={-1} data-autofocus className="sr-only">Lista de la clase</span>
      {q.error ? (
        <p className="roster-head__err"><WarningCircle size={18} /> {(q.error as Error).message}</p>
      ) : !marks || !q.data ? (
        <SkeletonList rows={8} />
      ) : q.data.students.length === 0 ? (
        <p className="muted">Esta clase aún no tiene alumnos.</p>
      ) : (
        <RosterList
          rows={q.data.students.map((r) => ({ id: r.student.id, name: r.student.sort_name, status: r.absent ? 'absent' : marks[r.student.id], disabled: r.absent }))}
          label={LABEL} tone={TONE}
          onTap={(id) => {
            const next = { ...marks, [id]: NEXT[marks[id]] };
            setMarks(next);
            autosave.schedule(next);
          }}
        />
      )}
    </Sheet>
  );
}
