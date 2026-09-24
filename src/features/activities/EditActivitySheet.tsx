import { Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useActivity, useDeleteActivity, usePatchActivity, type ActivityDetail } from '../../api/activities';
import type { CourseDetail } from '../../api/types';
import { plural } from '../../lib/format';
import { Button, Sheet, SkeletonList, useFeedback } from '../../ui';
import { ActivityForm, toInput, type ActivityFormValue } from './ActivityForm';
import './activities.css';

/** Edit or delete an activity (cuaderno column). Reached from the column header (long-press / right-click / pencil). */
export default function EditActivitySheet({ activityId, onClose, course, onDeleted }: {
  activityId: string | null; onClose: () => void; course: CourseDetail; onDeleted?: () => void;
}) {
  const q = useActivity(activityId ?? undefined);
  if (!activityId) return null;
  return (
    <>
      {!q.data ? (
        <Sheet open onClose={onClose} title="Editar actividad">
          {q.error ? <p className="muted">{q.error.message}</p> : <SkeletonList rows={3} />}
        </Sheet>
      ) : (
        <EditForm key={q.data.id} activity={q.data} onClose={onClose} course={course} onDeleted={onDeleted} />
      )}
    </>
  );
}

function EditForm({ activity, onClose, course, onDeleted }: { activity: ActivityDetail; onClose: () => void; course: CourseDetail; onDeleted?: () => void }) {
  const { toast, confirm } = useFeedback();
  const patch = usePatchActivity(activity.id, course.id);
  const del = useDeleteActivity(course.id);
  const [value, setValue] = useState<ActivityFormValue>({
    title: activity.title, kind: activity.kind, date: activity.date, max_score: activity.max_score,
    category: activity.category, weight: activity.weight, unit_ids: activity.unit_ids,
    counts_for: activity.counts_for, recovers_term: activity.recovers_term, student_ids: activity.student_ids,
  });
  const ready = value.title.trim().length > 0 && !(value.student_ids && !value.student_ids.length);

  const save = () => patch.mutate(toInput(value), {
    onSuccess: () => { toast('Actividad guardada'); onClose(); },
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  const remove = async () => {
    const n = activity.stats.graded + activity.stats.suggested;
    const ok = await confirm({
      title: `Eliminar «${activity.title}»`,
      text: n ? `Se borrarán también ${plural(n, 'nota', 'notas')} y las hojas escaneadas. No se puede deshacer.` : 'No tiene notas todavía.',
      confirm: 'Eliminar', danger: true,
    });
    if (!ok) return;
    del.mutate(activity.id, {
      onSuccess: () => { toast('Actividad eliminada'); onClose(); onDeleted?.(); },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  return (
    <Sheet open onClose={onClose} title="Editar actividad" subtitle={course.label}
      footer={<>
        <Button variant="neutral" onClick={onClose}>Cancelar</Button>
        <Button loading={patch.isPending} disabled={!ready} onClick={save}>{ready ? 'Guardar' : !value.title.trim() ? 'Escribe un título' : 'Elige algún alumno'}</Button>
      </>}>
      <form onSubmit={(e) => { e.preventDefault(); if (ready) save(); }}>
        <ActivityForm value={value} onChange={setValue} categories={course.categories} courseId={course.id} moreOpen />
        <button type="submit" hidden />
      </form>
      <div className="act-form__danger">
        <Button variant="danger" icon={<Trash size={18} />} loading={del.isPending} onClick={remove}>Eliminar actividad</Button>
      </div>
    </Sheet>
  );
}
