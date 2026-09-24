import { Plus, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeleteCourse, usePatchCourse } from '../../api/core';
import type { Category, CourseDetail, Slot } from '../../api/types';
import { ApiError } from '../../lib/api';
import { courseLabel } from '../../lib/format';
import { Button, IconButton, Sheet, TextField, useFeedback } from '../../ui';
import ColorSwatches from './ColorSwatches';
import ScheduleEditor from './ScheduleEditor';
import './course-forms.css';

interface Draft { subject: string; short: string; room: string; color: string; schedule: Slot[]; categories: Category[] }

function slug(label: string): string {
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'cat'}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Ajustes de la clase: datos, horario, ponderaciones; archivar / eliminar al final. */
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
      schedule: course.schedule.map((s) => ({ ...s })), categories: course.categories.map((c) => ({ ...c })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!d) return null;
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });
  const setCat = (i: number, c: Partial<Category>) => set('categories', d.categories.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const total = d.categories.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const blocker = !d.subject.trim() ? 'Escribe la materia'
    : d.categories.some((c) => !c.label.trim()) ? 'Pon nombre a cada categoría'
      : total <= 0 ? 'Las ponderaciones deben sumar más de 0' : null;

  const save = async () => {
    setError(null);
    const removed = course.categories.filter((c) => !d.categories.some((x) => x.key === c.key));
    if (removed.length && !(await confirm({
      title: `Quitar ${removed.map((c) => `«${c.label}»`).join(', ')}`,
      text: 'Las actividades de esa categoría dejarán de contar en la media hasta que las cambies de categoría.',
      confirm: 'Guardar igualmente', danger: true,
    }))) return;
    try {
      await patch.mutateAsync({
        subject: d.subject.trim(), short: d.short.trim() || null, room: d.room.trim() || null, color: d.color, schedule: d.schedule,
        categories: d.categories.map((c) => ({ ...c, label: c.label.trim(), weight: Number(c.weight) || 0 })),
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
          <ScheduleEditor value={d.schedule} onChange={(s) => set('schedule', s)} />
          <span className="field__hint">Cambiar el horario no borra las listas ni las sesiones pasadas.</span>
        </div>

        <div className="chips-field">
          <span className="field__label">Ponderaciones</span>
          <div className="weights">
            {d.categories.map((c, i) => (
              <div key={c.key} className="weight-row">
                <input className="input" aria-label="Categoría" value={c.label} onChange={(e) => setCat(i, { label: e.target.value })} />
                <label className="weight-pct">
                  <input className="input" type="number" inputMode="decimal" min={0} max={100} aria-label={`Peso de ${c.label}`}
                    value={Number.isFinite(c.weight) ? c.weight : ''} onChange={(e) => setCat(i, { weight: e.target.value === '' ? NaN : Number(e.target.value) })} />
                  <span>%</span>
                </label>
                <IconButton label={`Quitar ${c.label}`} size="sm" disabled={d.categories.length <= 1}
                  onClick={() => set('categories', d.categories.filter((_, j) => j !== i))}><X size={16} /></IconButton>
              </div>
            ))}
            <div className="weights__total">
              <Button type="button" size="sm" variant="plain" icon={<Plus size={16} />}
                onClick={() => set('categories', [...d.categories, { key: slug('categoria'), label: '', weight: 0 }])}>Añadir categoría</Button>
              <span className="num">Total <b>{Math.round(total * 10) / 10} %</b></span>
            </div>
          </div>
          <span className="field__hint">
            La media de cada evaluación es la media de cada categoría multiplicada por su peso. Si una categoría aún no tiene notas, no cuenta.
            {total !== 100 && total > 0 && ' Los pesos se usan como proporciones aunque no sumen 100.'}
          </span>
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
