import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KIND_CATEGORY, useCreateActivity, type ActivityBrief } from '../../api/activities';
import type { CourseDetail } from '../../api/types';
import { useToday } from '../../lib/auth';
import { Button, Sheet, useFeedback } from '../../ui';
import { ActivityForm, toInput, type ActivityFormValue } from './ActivityForm';

/** "+ Actividad": creates a gradebook column. Exams open their activity page; other kinds stay in the cuaderno.
 * `initial` pre-fills the form (e.g. "Crear recuperación" from Evaluación: recovery for the failing students). */
export default function NewActivitySheet({ open, onClose, course, onCreated, initial, title, subtitle }: {
  open: boolean; onClose: () => void; course: CourseDetail; onCreated?: (a: ActivityBrief) => void;
  initial?: Partial<ActivityFormValue>; title?: string; subtitle?: string;
}) {
  if (!open) return null;
  return <NewActivityForm onClose={onClose} course={course} onCreated={onCreated} initial={initial} title={title} subtitle={subtitle} />;
}

function NewActivityForm({ onClose, course, onCreated, initial, title, subtitle }: {
  onClose: () => void; course: CourseDetail; onCreated?: (a: ActivityBrief) => void; initial?: Partial<ActivityFormValue>;
  title?: string; subtitle?: string;
}) {
  const today = useToday();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const create = useCreateActivity(course.id);
  const firstCat = course.categories[0]?.key ?? 'exams';
  const [value, setValue] = useState<ActivityFormValue>({
    title: '', kind: 'exam', date: today, max_score: 10, weight: 1, unit_ids: [],
    category: course.categories.some((c) => c.key === KIND_CATEGORY.exam) ? KIND_CATEGORY.exam : firstCat,
    counts_for: 'average', recovers_term: null, student_ids: null, ...initial,
  });
  const noStudents = !!value.student_ids && !value.student_ids.length;
  const ready = value.title.trim().length > 0 && !noStudents;

  const submit = () => {
    if (!ready) return;
    create.mutate(toInput(value), {
      onSuccess: (a) => {
        toast(`«${a.title}» añadida al cuaderno`);
        onClose();
        if (a.kind === 'exam') navigate(`/clases/${course.id}/actividades/${a.id}`);
        else onCreated?.(a);
      },
      onError: (e) => toast(e.message, { tone: 'error' }),
    });
  };

  return (
    <Sheet open onClose={onClose} dirty={value.title.trim() !== (initial?.title ?? '').trim()} title={title ?? 'Nueva actividad'} subtitle={subtitle ?? course.label}
      footer={<Button full loading={create.isPending} disabled={!ready} onClick={submit}>
        {ready ? 'Crear actividad' : noStudents ? 'Elige algún alumno' : 'Escribe un título'}
      </Button>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ActivityForm value={value} onChange={setValue} categories={course.categories} courseId={course.id} stage={course.group.stage}
          autoFocus={!initial} pickUnit={!initial}
          moreOpen={!!initial && (initial.counts_for !== undefined || initial.student_ids !== undefined)} />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
