import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeleteCourse, usePatchCourse } from '../../api/core';
import type { CourseDetail, Slot } from '../../api/types';
import { ApiError } from '../../lib/api';
import { courseLabel } from '../../lib/format';
import { Button, Sheet, TextField, useFeedback } from '../../ui';
import ColorSwatches from './ColorSwatches';
import ScheduleEditor from './ScheduleEditor';
import './course-forms.css';

interface Draft { subject: string; short: string; room: string; color: string; schedule: Slot[] }

/** Ajustes de la clase: datos y horario; archivar / eliminar al final. Las ponderaciones viven en el Cuaderno. */
export default function CourseSettingsSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: CourseDetail }) {
  const navigate = useNavigate();
  const { toast, confirm } = useFeedback();
  const patch = usePatchCourse(course.id);
  const del = useDeleteCourse();
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setD({
      subject: course.subject, short: course.short ?? '', room: course.room ?? '', color: course.color,
      schedule: course.schedule.map((s) => ({ ...s })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!d) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const blocker = !d.subject.trim() ? 'Escribe la materia' : null;

  const save = async () => {
    setError(null);
    try {
      await patch.mutateAsync({
        subject: d.subject.trim(), short: d.short.trim() || null, room: d.room.trim() || null, color: d.color, schedule: d.schedule,
      });
      toast('Cambios guardados');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se ha podido guardar. Revisa la conexión y vuelve a intentarlo.');
    }
  };

  const archive = async () => {
    if (!(await confirm({
      title: 'Archivar clase', confirm: 'Archivar',
      text: 'Deja de aparecer en Hoy y en Clases. Sus notas se conservan y puedes recuperarla desde Clases.',
    }))) return;
    try {
      await patch.mutateAsync({ archived: true });
      onClose();
      navigate('/clases');
      toast('Clase archivada');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se ha podido archivar.', { tone: 'error' });
    }
  };

  const remove = async () => {
    if (!(await confirm({
      title: `Eliminar ${courseLabel(course)}`, confirm: 'Eliminar definitivamente', danger: true,
      text: 'Se borran sus actividades, notas, programación, materiales y asistencia. No se puede deshacer. Los alumnos y sus observaciones se conservan.',
    }))) return;
    try {
      await del.mutateAsync({ id: course.id, permanent: true });
      onClose();
      navigate('/clases', { replace: true });
      toast('Clase eliminada');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'No se ha podido eliminar.', { tone: 'error' });
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ajustes de la clase" subtitle={courseLabel(course)} size="large"
      footer={<Button full onClick={save} loading={patch.isPending && !patch.variables?.archived} disabled={!!blocker}>{blocker ?? 'Guardar cambios'}</Button>}>
      <div className="form">
        <div className="form-row">
          <TextField label="Materia" value={d.subject} onChange={(e) => set('subject', e.target.value)} />
          <TextField label="Abreviatura" placeholder="Mates" value={d.short} maxLength={24}
            onChange={(e) => set('short', e.target.value)} />
        </div>
        <TextField label="Aula" placeholder="204" value={d.room} onChange={(e) => set('room', e.target.value)} />
        <div className="chips-field">
          <span className="field__label">Color</span>
          <ColorSwatches value={d.color} onChange={(c) => set('color', c)} />
        </div>
        <div className="chips-field">
          <span className="field__label">Horario</span>
          <ScheduleEditor value={d.schedule} onChange={(s) => set('schedule', s)} courseId={course.id} />
          <span className="field__hint">Cambiar el horario no borra las listas ni las sesiones pasadas.</span>
        </div>

        {error && <div className="field__error" role="alert">{error}</div>}

        <div className="sheet-danger">
          <Button variant="neutral" full onClick={archive}>Archivar clase</Button>
          <Button variant="danger" full onClick={remove} loading={del.isPending}>Eliminar definitivamente</Button>
        </div>
      </div>
    </Sheet>
  );
}
