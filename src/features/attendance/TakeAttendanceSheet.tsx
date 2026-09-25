/** «Pasar lista»: todos presentes por defecto; tocar = falta, otro toque = retraso, otro = presente. Guardado automático
 *  de solo lo que cambia (dos dispositivos con la misma lista no se pisan). Mantener pulsado (clic derecho en escritorio):
 *  justificar o añadir nota. En escritorio se abre como panel lateral. */
import { useQueryClient } from '@tanstack/react-query';
import { NotePencil, SealCheck, WarningCircle } from '@phosphor-icons/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invalidateAttendance, MARK_LABEL, useAttendance, useSaveAttendance, type AttendanceInput, type MarkStatus } from '../../api/attendance';
import { api } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { longDate, plural } from '../../lib/format';
import { Button, Sheet, SkeletonList, useFeedback, type MenuItem } from '../../ui';
import { RosterList, SAVE_LABEL, useAutosave } from './RosterList';

export interface TakeAttendanceSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  /** Course label, e.g. "Matemáticas · 2º ESO B". */
  label?: string;
  room?: string | null;
}

type Mark = { status: MarkStatus; note: string };
type Marks = Record<string, Mark>;

const NEXT: Record<MarkStatus, MarkStatus> = { present: 'absent', absent: 'late', late: 'present', justified: 'present' };
const TONE = { present: 'muted', absent: 'danger', late: 'warn', justified: 'info' } as const;
const NAMES: [MarkStatus, string, string][] = [['absent', 'Falta', 'Faltan'], ['late', 'Retraso', 'Retrasos'], ['justified', 'Justificada', 'Justificadas']];

export default function TakeAttendanceSheet(props: TakeAttendanceSheetProps) {
  if (!props.open) return null;
  return <AttendanceSheetBody key={`${props.courseId}|${props.date}|${props.start}`} {...props} />;
}

function AttendanceSheetBody({ onClose, courseId, date, start, label, room }: TakeAttendanceSheetProps) {
  const today = useToday();
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const q = useAttendance(courseId, date, start);
  const save = useSaveAttendance(courseId);
  const [marks, setMarks] = useState<Marks | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const navigate = useNavigate();
  // The marks as the server has them: only the students that differ from these are sent.
  const saved = useRef<Marks>({});
  const changes = (m: Marks): AttendanceInput => ({
    date, start,
    marks: Object.entries(m).filter(([id, v]) => saved.current[id]?.status !== v.status || saved.current[id]?.note !== v.note.trim())
      .map(([student_id, v]) => ({ student_id, status: v.status, note: v.note.trim() || null })),
  });
  const autosave = useAutosave(async (m: Marks) => {
    const body = changes(m);
    await save.mutateAsync(body);
    for (const x of body.marks) saved.current[x.student_id] = { status: x.status, note: x.note ?? '' };
  }, (m: Marks) => api.keepalive('PUT', `/courses/${courseId}/attendance`, changes(m)));

  // Initialise local state once from the server (later refetches must not overwrite taps in progress).
  useEffect(() => {
    if (marks || !q.data) return;
    const loaded = Object.fromEntries(q.data.students.map((r) => [r.student.id, { status: r.status, note: r.note ?? '' }]));
    saved.current = { ...loaded };
    setMarks(loaded);
  }, [q.data, marks]);

  const update = (id: string, patch: Partial<Mark>, delay?: number) => {
    if (!marks) return;
    const next = { ...marks, [id]: { ...marks[id], ...patch } };
    setMarks(next);
    autosave.schedule(next, delay);
  };

  const counts = { present: 0, absent: 0, late: 0, justified: 0 };
  for (const m of Object.values(marks ?? {})) counts[m.status]++;
  const summary = [
    counts.present > 0 && plural(counts.present, 'presente', 'presentes'), counts.absent > 0 && plural(counts.absent, 'falta', 'faltas'),
    counts.late > 0 && plural(counts.late, 'retraso', 'retrasos'), counts.justified > 0 && plural(counts.justified, 'justificada', 'justificadas'),
  ].filter(Boolean).join(' · ');

  const finish = async (explicit: boolean) => {
    const needsSave = autosave.isDirty() || (explicit && !q.data?.taken);
    if (needsSave && marks && !(await autosave.flush(marks))) {
      toast('No se ha podido guardar la lista. Revisa la conexión y vuelve a intentarlo.', { tone: 'error' });
      return;
    }
    invalidateAttendance(qc, courseId);
    if (explicit || needsSave || autosave.state === 'saved') toast(`Lista pasada · ${summary}`);
    onClose();
  };

  const rows = q.data?.students ?? [];
  const empty = !!q.data && rows.length === 0;
  const names = marks ? NAMES.flatMap(([st, one, many]) => {
    const who = rows.filter((r) => marks[r.student.id]?.status === st).map((r) => r.student.sort_name);
    return who.length ? [{ st, text: who.length === 1 ? one : many, who: who.join('; ') }] : [];
  }) : [];
  const when = [date !== today && longDate(date), q.data?.end ? `${start}–${q.data.end}` : start, room && `Aula ${room}`]
    .filter(Boolean).join(' · ');

  const options = (id: string): MenuItem[] => {
    const m = marks?.[id];
    if (!m) return [];
    return [
      m.status === 'justified'
        ? { label: 'Quitar justificación', icon: <SealCheck size={18} />, onSelect: () => update(id, { status: 'absent' }, 0) }
        : { label: 'Justificar falta', icon: <SealCheck size={18} />, onSelect: () => update(id, { status: 'justified' }, 0) },
      ...(m.status !== 'present' ? [{ label: m.note ? 'Editar nota' : 'Añadir nota', icon: <NotePencil size={18} />, onSelect: () => setEditing(id) }] : []),
    ];
  };

  return (
    <Sheet open side size="large" onClose={() => void finish(false)} title={label ?? 'Pasar lista'}
      subtitle={
        <span className="roster-head">
          <span className="roster-head__meta">
            <span>{when}</span>
            {autosave.state !== 'idle' && <span className={autosave.state === 'error' ? 'roster-head__err' : 'faint'}>{SAVE_LABEL[autosave.state]}</span>}
          </span>
          {marks && summary && <span className="roster-head__sum num">{summary}</span>}
          {names.length > 0 && (
            <span className="roster-head__names">
              {names.map((n, i) => <Fragment key={n.st}>{i > 0 && ' · '}{n.text}: <b>{n.who}</b></Fragment>)}
            </span>
          )}
          {!empty && <span className="roster-head__do">Toca a quien falte. Otro toque: retraso.</span>}
        </span>
      }
      footer={empty
        ? <Button full onClick={() => { onClose(); navigate(`/clases/${courseId}/alumnos?anadir=1`); }}>Añadir alumnos</Button>
        : <Button full onClick={() => void finish(true)} disabled={!marks}>Cerrar lista</Button>}>
      <span tabIndex={-1} data-autofocus className="sr-only">Lista de la clase</span>
      {q.error ? (
        <p className="roster-head__err"><WarningCircle size={18} /> {(q.error as Error).message}</p>
      ) : !marks || !q.data ? (
        <SkeletonList rows={8} />
      ) : empty ? (
        <p className="muted">Esta clase aún no tiene alumnos.</p>
      ) : (
        <RosterList
          rows={rows.map((r) => ({ id: r.student.id, name: r.student.sort_name, status: marks[r.student.id].status, note: marks[r.student.id].note }))}
          label={MARK_LABEL} tone={TONE}
          onTap={(id) => { setEditing(null); update(id, { status: NEXT[marks[id].status] }); }}
          options={(row) => options(row.id)}
          editor={editing ? {
            id: editing,
            node: <input className="input" autoFocus placeholder="Motivo, hora de llegada…" value={marks[editing].note}
              aria-label="Nota" onChange={(e) => update(editing, { note: e.target.value }, 1200)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} onBlur={() => setEditing(null)} />,
          } : null}
        />
      )}
    </Sheet>
  );
}
