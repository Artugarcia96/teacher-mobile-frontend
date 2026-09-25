import { Plus, X } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { usePatchCourse } from '../../api/core';
import type { Category, CourseDetail } from '../../api/types';
import { ApiError } from '../../lib/api';
import { Button, IconButton, Sheet, useFeedback } from '../../ui';
import '../../features/course/course-forms.css';

function newKey(label: string): string {
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${base || 'cat'}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Ponderaciones: the categories of the class and their weight in each term's average. */
export default function WeightsSheet({ open, onClose, course }: { open: boolean; onClose: () => void; course: CourseDetail }) {
  const { toast, confirm } = useFeedback();
  const patch = usePatchCourse(course.id);
  const [cats, setCats] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCats(course.categories.map(({ key, label, weight }) => ({ key, label, weight })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setCat = (i: number, c: Partial<Category>) => setCats(cats.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const total = cats.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const blocker = cats.some((c) => !c.label.trim()) ? 'Pon nombre a cada categoría'
    : total <= 0 ? 'Los pesos deben sumar más de 0' : null;

  const save = async () => {
    setError(null);
    const removed = course.categories.filter((c) => (c.activities ?? 0) > 0 && !cats.some((x) => x.key === c.key));
    if (removed.length && !(await confirm({
      title: `Quitar ${removed.map((c) => `«${c.label}»`).join(', ')}`,
      text: (() => {
        const n = removed.reduce((s, c) => s + (c.activities ?? 0), 0);
        return n === 1 ? '1 actividad dejará de contar en la media hasta que la cambies de categoría.'
          : `${n} actividades dejarán de contar en la media hasta que las cambies de categoría.`;
      })(),
      confirm: 'Quitar', danger: true,
    }))) return;
    try {
      await patch.mutateAsync({ categories: cats.map((c) => ({ ...c, label: c.label.trim(), weight: Number(c.weight) || 0 })) });
      toast('Ponderaciones guardadas');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se han podido guardar. Revisa la conexión y vuelve a intentarlo.');
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Ponderaciones" subtitle={course.label}
      footer={<Button full onClick={save} loading={patch.isPending} disabled={!!blocker}>{blocker ?? 'Guardar'}</Button>}>
      <div className="form">
        <div className="weights">
          {cats.map((c, i) => (
            <div key={c.key} className="weight-row">
              <input className="input" aria-label="Categoría" placeholder="Categoría" value={c.label}
                onChange={(e) => setCat(i, { label: e.target.value })} />
              <label className="weight-pct">
                <input className="input" type="number" inputMode="decimal" min={0} max={100} aria-label={`Peso de ${c.label}`}
                  value={Number.isFinite(c.weight) ? c.weight : ''} onChange={(e) => setCat(i, { weight: e.target.value === '' ? NaN : Number(e.target.value) })} />
                <span>%</span>
              </label>
              <IconButton label={`Quitar ${c.label || 'categoría'}`} size="sm" disabled={cats.length <= 1}
                onClick={() => setCats(cats.filter((_, j) => j !== i))}><X size={16} /></IconButton>
            </div>
          ))}
          <div className="weights__total">
            <Button type="button" size="sm" variant="plain" icon={<Plus size={16} />}
              onClick={() => setCats([...cats, { key: newKey('categoria'), label: '', weight: 0 }])}>Añadir categoría</Button>
            <span className="num">Total <b>{Math.round(total * 10) / 10} %</b></span>
          </div>
        </div>
        <span className="field__hint">
          La media de la evaluación combina la media de cada categoría con su peso; una categoría sin notas no cuenta.
          {total !== 100 && total > 0 && ' No suman 100: se usan como proporciones.'}
        </span>
        {error && <div className="field__error" role="alert">{error}</div>}
      </div>
    </Sheet>
  );
}
