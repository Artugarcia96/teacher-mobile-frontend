/** "Pasar lista": todos presentes por defecto; tocar un alumno = falta → retraso → presente. Guardado automático. */
import { useQueryClient } from '@tanstack/react-query';
import { DotsThree, NotePencil, SealCheck, WarningCircle } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateAttendance, MARK_LABEL, useAttendance, useSaveAttendance, type MarkStatus } from '../../api/attendance';
import { longDate, plural } from '../../lib/format';
import { Avatar, Button, Chip, IconButton, Menu, Sheet, SkeletonList } from '../../ui';
import './attendance.css';

export interface TakeAttendanceSheetProps {
  open: boolean;
  onClose: () => void;
  courseId: string;
  date: string;
  start: string;
  /** Header label, e.g. "Matemáticas · 2º ESO B · 10:20". */
  label?: string;
}

type Mark = { status: MarkStatus; note: string };
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const NEXT: Record<MarkStatus, MarkStatus> = { present: 'absent', absent: 'late', late: 'present', justified: 'present' };
const TONE: Record<MarkStatus, 'danger' | 'warn' | 'info' | undefined> = { present: undefined, absent: 'danger', late: 'warn', justified: 'info' };

export default function TakeAttendanceSheet(props: TakeAttendanceSheetProps) {
  if (!props.open) return null;
  return <AttendanceSheetBody key={`${props.courseId}|${props.date}|${props.start}`} {...props} />;
}

function AttendanceSheetBody({ onClose, courseId, date, start, label }: TakeAttendanceSheetProps) {
  const qc = useQueryClient();
  const q = useAttendance(courseId, date, start);
  const save = useSaveAttendance(courseId);
  const [marks, setMarks] = useState<Record<string, Mark> | null>(null);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<{ marks: Record<string, Mark>; note: string } | null>(null);
  const dirty = useRef(false);

  // Initialise local state once from the server (later refetches must not overwrite taps in progress).
  useEffect(() => {
    if (marks || !q.data) return;
    const m: Record<string, Mark> = {};
    for (const r of q.data.students) m[r.student.id] = { status: r.status, note: r.note ?? '' };
    setMarks(m);
    setNote(q.data.note ?? '');
    latest.current = { marks: m, note: q.data.note ?? '' };
  }, [q.data, marks]);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const cur = latest.current;
    if (!cur) return;
    dirty.current = false;
    setState('saving');
    try {
      await save.mutateAsync({
        date, start, note: cur.note.trim() || null,
        marks: Object.entries(cur.marks).filter(([, v]) => v.status !== 'present')
          .map(([student_id, v]) => ({ student_id, status: v.status, note: v.note.trim() || null })),
      });
      setState('saved');
    } catch {
      dirty.current = true;
      setState('error');
    }
  }, [date, start, save]);

  const schedule = (next: { marks: Record<string, Mark>; note: string }, delay = 700) => {
    latest.current = next;
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
  };

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const update = (id: string, patch: Partial<Mark>) => {
    if (!marks) return;
    const next = { ...marks, [id]: { ...marks[id], ...patch } };
    setMarks(next);
    schedule({ marks: next, note }, 600);
  };

  const close = async () => {
    if (dirty.current) await flush();
    invalidateAttendance(qc, courseId);
    onClose();
  };

  const done = async () => {
    if (dirty.current || !q.data?.taken) await flush();
    invalidateAttendance(qc, courseId);
    onClose();
  };

  const counts = { present: 0, absent: 0, late: 0, justified: 0 };
  for (const m of Object.values(marks ?? {})) counts[m.status]++;
  const summary = [
    plural(counts.present, 'presente', 'presentes'),
    counts.absent > 0 && plural(counts.absent, 'falta', 'faltas'),
    counts.late > 0 && plural(counts.late, 'retraso', 'retrasos'),
    counts.justified > 0 && plural(counts.justified, 'justificada', 'justificadas'),
  ].filter(Boolean).join(' · ');

  const saveLabel = state === 'saving' ? 'Guardando…' : state === 'saved' ? 'Guardado' : state === 'error' ? 'No se ha podido guardar' : q.data?.taken ? 'Lista pasada' : 'Todos presentes por defecto';

  return (
    <Sheet open onClose={close} size="large" title={label ?? 'Pasar lista'}
      subtitle={<span className="att-sub">
        <span>{longDate(date)}{q.data?.end ? `, ${start}–${q.data.end}` : `, ${start}`}</span>
        {marks && <span className="att-sub__line"><b className="num">{summary}</b><span className={state === 'error' ? 'att-sub__err' : 'faint'}>{saveLabel}</span></span>}
      </span>}
      footer={<>
        <input className="input att-note" placeholder="Nota de la sesión" value={note} aria-label="Nota de la sesión"
          onChange={(e) => { setNote(e.target.value); if (marks) schedule({ marks, note: e.target.value }, 1200); }} />
        <Button className="att-done" onClick={done} disabled={!marks}>Hecho</Button>
      </>}>
      <span tabIndex={-1} data-autofocus className="sr-only">Lista de la clase</span>
      {q.error ? (
        <p className="att-error"><WarningCircle size={18} /> {(q.error as Error).message}</p>
      ) : !marks || !q.data ? (
        <SkeletonList rows={8} />
      ) : q.data.students.length === 0 ? (
        <p className="muted">Esta clase aún no tiene alumnos.</p>
      ) : (
        <div className="list" role="list">
          {q.data.students.map(({ student }) => {
            const m = marks[student.id];
            return (
              <div key={student.id} className="row att-row" role="listitem">
                <button type="button" className="att-row__tap" onClick={() => update(student.id, { status: NEXT[m.status] })}
                  aria-label={`${student.sort_name}: ${MARK_LABEL[m.status]}. Toca para cambiar`}>
                  <Avatar initials={student.initials} />
                  <span className="att-row__main">
                    <span className="att-row__name">{student.sort_name}</span>
                    {m.note && editingNote !== student.id && <span className="att-row__note">{m.note}</span>}
                  </span>
                  {m.status !== 'present' && <Chip tone={TONE[m.status]}>{MARK_LABEL[m.status]}</Chip>}
                </button>
                <Menu
                  trigger={(open) => <IconButton label={`Más opciones de ${student.name}`} size="sm" onClick={open}><DotsThree size={20} weight="bold" /></IconButton>}
                  items={[
                    m.status === 'justified'
                      ? { label: 'Quitar justificación', icon: <SealCheck size={18} />, onSelect: () => update(student.id, { status: 'absent' }) }
                      : { label: 'Justificar falta', icon: <SealCheck size={18} />, onSelect: () => update(student.id, { status: 'justified' }) },
                    ...(m.status !== 'present' ? [{ label: m.note ? 'Editar nota' : 'Añadir nota', icon: <NotePencil size={18} />, onSelect: () => setEditingNote(student.id) }] : []),
                  ]}
                />
                {editingNote === student.id && (
                  <div className="att-row__edit">
                    <input className="input" autoFocus placeholder="Motivo, hora de llegada…" value={m.note} aria-label={`Nota de ${student.name}`}
                      onChange={(e) => update(student.id, { note: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && setEditingNote(null)} onBlur={() => setEditingNote(null)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
