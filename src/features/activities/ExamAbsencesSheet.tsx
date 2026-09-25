import { Warning } from '@phosphor-icons/react';
import { useState } from 'react';
import { useActivity, useMarkNotPresented, useScheduleRepeat, type ActivityDetail, type AttendanceConflict } from '../../api/activities';
import type { CourseDetail } from '../../api/types';
import { useToday } from '../../lib/auth';
import { addDays, formatScore, longDate, plural, shortDate } from '../../lib/format';
import { Button, Callout, Chip, DateField, List, Row, Sheet, SkeletonList, useFeedback } from '../../ui';
import './activities.css';

/** Students who missed an exam (attendance list of the exam day): schedule a repeat ("repesca", its grades go to the
 * same column) or mark NP. Warns when someone marked absent has a paper or a grade. Mountable from any screen. */
export default function ExamAbsencesSheet({ activityId, onClose, course }: {
  activityId: string | null; onClose: () => void; course: CourseDetail;
}) {
  const q = useActivity(activityId ?? undefined);
  if (!activityId) return null;
  if (!q.data) {
    return (
      <Sheet open onClose={onClose} title="Faltaron al examen">
        {q.error ? <p className="muted">{q.error.message}</p> : <SkeletonList rows={3} />}
      </Sheet>
    );
  }
  return <Absences key={q.data.id} activity={q.data} onClose={onClose} course={course} />;
}

function Absences({ activity, onClose, course }: { activity: ActivityDetail; onClose: () => void; course: CourseDetail }) {
  const today = useToday();
  const { toast, confirm } = useFeedback();
  const repeat = useScheduleRepeat(activity.id, course.id);
  const np = useMarkNotPresented(activity.id, course.id);
  const pending = activity.absent_students.filter((a) => a.pending);
  const [picked, setPicked] = useState<string[]>(() => pending.filter((a) => !a.repeat_id).map((a) => a.student.id));
  const nextDate = course.next_session?.date && course.next_session.date > today ? course.next_session.date : addDays(today, 7);
  const [date, setDate] = useState(nextDate);
  const chosen = pending.filter((a) => picked.includes(a.student.id));
  const repeatOf = (id: string | null) => activity.repeats.find((r) => r.id === id);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const schedule = () => repeat.mutate({ date, student_ids: chosen.map((a) => a.student.id) }, {
    onSuccess: () => { toast(`Repesca el ${shortDate(date)} para ${plural(chosen.length, 'alumno', 'alumnos')}. Su nota irá a esta columna.`); onClose(); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const markNP = async () => {
    const ok = await confirm({
      title: `Poner NP a ${plural(chosen.length, 'alumno', 'alumnos')}`,
      text: `${chosen.map((a) => a.student.sort_name).join('; ')}. El NP no cuenta en la media. Puedes cambiarlo después desde el cuaderno.`,
      confirm: 'Poner NP',
    });
    if (!ok) return;
    // A student with a repesca scheduled gets the NP in the repesca (their slot), the rest in this exam.
    np.mutate(chosen.map((a) => ({ activityId: a.repeat_id ?? activity.id, studentId: a.student.id })), {
      onSuccess: () => { toast(`NP puesto a ${plural(chosen.length, 'alumno', 'alumnos')}`); onClose(); },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  const status = (a: ActivityDetail['absent_students'][number]) => {
    const kind = a.justified ? 'Falta justificada' : 'Falta sin justificar';
    const rep = repeatOf(a.repeat_id);
    if (rep && a.pending) return `${kind} · repesca el ${shortDate(rep.date)}`;
    if (a.pending) return `${kind} · pendiente`;
    const row = activity.sheet.find((s) => s.student.id === a.student.id);
    if (row?.status === 'absent') return `${kind} · NP`;
    return `${kind} · con nota`;
  };

  return (
    <Sheet open onClose={onClose} title={`Faltaron a ${activity.title}`} subtitle={`${longDate(activity.date)} · según la lista de ese día`}
      footer={chosen.length > 0 ? (
        <>
          <Button variant="neutral" onClick={markNP} loading={np.isPending}>Poner NP ({chosen.length})</Button>
          <Button onClick={schedule} loading={repeat.isPending}>Programar repesca ({chosen.length})</Button>
        </>
      ) : undefined}>
      <div className="form">
        {activity.attendance_conflicts.length > 0 && (
          <Callout tone="warn" icon={<Warning size={20} />}>
            <b>¿Hoja mal asignada o lista mal pasada?</b> {conflictsText(activity.attendance_conflicts)}
          </Callout>
        )}
        <List>
          {activity.absent_students.map((a) => (
            <Row key={a.student.id} title={a.student.sort_name} sub={status(a)}
              trail={a.repeat_id ? <Button size="sm" variant="plain" to={`/clases/${course.id}/actividades/${a.repeat_id}`}>Ver repesca</Button> : undefined} />
          ))}
        </List>
        {pending.length > 0 ? (
          <>
            <div className="field">
              <span className="field__label">Para quién</span>
              <div className="chip-row">
                {pending.map((a) => (
                  <Chip key={a.student.id} selected={picked.includes(a.student.id)} onClick={() => toggle(a.student.id)}>
                    {a.student.first_name} {a.student.last_name.split(' ')[0]}
                  </Chip>
                ))}
              </div>
            </div>
            {chosen.length > 0 ? (
              <DateField label="Fecha de la repesca" value={date} min={activity.date} onChange={(v) => v && setDate(v)}
                hint="La repesca es la misma prueba (misma rúbrica) solo para ellos; su nota ocupa el hueco de este examen." />
            ) : pending.every((a) => a.repeat_id) ? (
              <p className="muted">Repesca programada: su nota irá a la columna de este examen. Si no se presenta, elígelo para ponerle NP.</p>
            ) : (
              <p className="muted">Elige al menos un alumno.</p>
            )}
          </>
        ) : (
          <p className="muted">No queda nadie pendiente de este examen.</p>
        )}
      </div>
    </Sheet>
  );
}

/** "García López, Ana figura como ausente y tiene hoja y nota 8,25; …." */
export function conflictsText(conflicts: AttendanceConflict[]): string {
  return `${conflicts.map((c) => `${c.student.sort_name} figura como ausente y tiene ${conflictWhat(c)}`).join('; ')}.`;
}

/** "hoja y nota 8,25" · "nota 8,25" · "hoja" · "nota de la IA 6,5" */
function conflictWhat(c: AttendanceConflict): string {
  const score = c.score != null ? `${c.status === 'suggested' ? 'nota de la IA' : 'nota'} ${formatScore(c.score)}` : null;
  if (c.has_paper && score) return `hoja y ${score}`;
  return score ?? 'hoja';
}
