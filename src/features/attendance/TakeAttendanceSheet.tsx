/** «Pasar lista»: todos presentes por defecto; tocar = falta, otro toque = retraso, otro = presente. Guardado automático
 *  de solo lo que cambia (dos dispositivos con la misma lista no se pisan). Mantener pulsado (clic derecho en escritorio):
 *  justificar o añadir nota. En escritorio se abre como panel lateral. */
import { useQueryClient } from '@tanstack/react-query';
import { NotePencil, SealCheck, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { invalidateAttendance, MARK_LABEL, useAttendance, useSaveAttendance, type AttendanceInput, type MarkStatus } from '../../api/attendance';
import { api } from '../../lib/api';
import { useToday } from '../../lib/auth';
import { longDate, plural, roomLabel } from '../../lib/format';
import { Button, Sheet, SkeletonList, useFeedback, type MenuItem } from '../../ui';
import { RosterList, RosterMeta, useAutosave } from './RosterList';

export interface TakeAttendanceSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  /** Group first, one line: `courseShortLabel(course)` ("2.º ESO B · Mates"). */
  label?: string;
  room?: string | null;
}

type Mark = { status: MarkStatus; note: string };
type Marks = Record<string, Mark>;

const NEXT: Record<MarkStatus, MarkStatus> = { present: 'absent', absent: 'late', late: 'present', justified: 'present' };
const TONE = { present: 'muted', absent: 'danger', late: 'warn', justified: 'info' } as const;

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

  // Local state starts from the server; later refetches only bring in students it does not have yet (the list was
  // opened from a cached copy, or someone was added meanwhile) and never overwrite taps in progress.
  useEffect(() => {
    if (!q.data) return;
    const added = q.data.students.filter((r) => !marks?.[r.student.id]);
    if (marks && added.length === 0) return;
    const loaded = Object.fromEntries(added.map((r) => [r.student.id, { status: r.status, note: r.note ?? '' }]));
    saved.current = { ...saved.current, ...loaded };
    setMarks({ ...marks, ...loaded });
  }, [q.data, marks]);

  const update = (id: string, patch: Partial<Mark>, delay?: number) => {
    if (!marks) return;
    const next = { ...marks, [id]: { ...marks[id], ...patch } };
    setMarks(next);
    autosave.schedule(next, delay);
  };

  const local = marks ?? {};
  const rows = (q.data?.students ?? []).filter((r) => local[r.student.id]);
  const counts = { present: 0, absent: 0, late: 0, justified: 0 };
  for (const r of rows) counts[local[r.student.id].status]++;
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

  // A cached empty list (the class had no students when it was last opened) waits for the server before saying so.
  const loading = !marks || !q.data || (q.data.students.length === 0 && q.isFetching);
  const empty = !loading && q.data?.students.length === 0;
  const when = [date !== today && longDate(date), q.data?.end ? `${start}–${q.data.end}` : start, room && roomLabel(room)]
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
    <Sheet open side size="large" onClose={() => void finish(false)} title={<span className="roster-title">{label ?? 'Pasar lista'}</span>}
      subtitle={
        // One line each, whatever is tapped: the rows below never move.
        <span className="roster-head">
          <RosterMeta text={when} state={autosave.state} />
          {!empty && <span className="roster-head__sum num">{summary || '\u00a0'}</span>}
          {!empty && <span className="roster-head__do">Toca a quien falte. Otro toque: retraso.</span>}
        </span>
      }
      footer={empty
        ? <Button full onClick={() => { onClose(); navigate(`/clases/${courseId}/alumnos?anadir=1`); }}>Añadir alumnos</Button>
        : <Button full onClick={() => void finish(true)} disabled={!marks}>Cerrar lista</Button>}>
      <span tabIndex={-1} data-autofocus className="sr-only">Lista de la clase</span>
      {q.error ? (
        <p className="roster-head__err"><WarningCircle size={18} /> {(q.error as Error).message}</p>
      ) : loading ? (
        <SkeletonList rows={8} />
      ) : empty ? (
        <p className="muted">Esta clase aún no tiene alumnos.</p>
      ) : (
        <RosterList
          rows={rows.map((r) => ({ id: r.student.id, name: r.student.sort_name, status: local[r.student.id].status, note: local[r.student.id].note }))}
          label={MARK_LABEL} tone={TONE}
          onTap={(id) => { setEditing(null); update(id, { status: NEXT[local[id].status] }); }}
          options={(row) => options(row.id)}
          editor={editing ? {
            id: editing,
            node: <input className="input" autoFocus placeholder="Motivo, hora de llegada…" value={local[editing].note}
              aria-label="Nota" onChange={(e) => update(editing, { note: e.target.value }, 1200)}
              onKeyDown={(e) => e.key === 'Enter' && setEditing(null)} onBlur={() => setEditing(null)} />,
          } : null}
        />
      )}
    </Sheet>
  );
}
