import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KIND_CATEGORY, useCreateActivity, type ActivityBrief } from '../../api/activities';
import type { CourseDetail } from '../../api/types';
import { useToday } from '../../lib/auth';
import { Button, Sheet, useFeedback } from '../../ui';
import { ActivityForm, toInput, type ActivityFormValue } from './ActivityForm';

/** "+ Actividad": creates a gradebook column. Exams open their activity page; other kinds stay in the cuaderno. */
export default function NewActivitySheet({ open, onClose, course, onCreated }: {
  open: boolean; onClose: () => void; course: CourseDetail; onCreated?: (a: ActivityBrief) => void;
}) {
  if (!open) return null;
  return <NewActivityForm onClose={onClose} course={course} onCreated={onCreated} />;
}

function NewActivityForm({ onClose, course, onCreated }: { onClose: () => void; course: CourseDetail; onCreated?: (a: ActivityBrief) => void }) {
  const today = useToday();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const create = useCreateActivity(course.id);
  const firstCat = course.categories[0]?.key ?? 'exams';
  const [value, setValue] = useState<ActivityFormValue>({
    title: '', kind: 'exam', date: today, max_score: 10, weight: 1, unit_ids: [],
    category: course.categories.some((c) => c.key === KIND_CATEGORY.exam) ? KIND_CATEGORY.exam : firstCat,
  });
  const ready = value.title.trim().length > 0;

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
    <Sheet open onClose={onClose} title="Nueva actividad" subtitle={course.label}
      footer={<Button full loading={create.isPending} disabled={!ready} onClick={submit}>{ready ? 'Crear actividad' : 'Escribe un título'}</Button>}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <ActivityForm value={value} onChange={setValue} categories={course.categories} courseId={course.id} autoFocus />
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
