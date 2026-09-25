import { Plus, Warning } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useSaveRubric, type Rubric, type RubricItem } from '../../api/papers';
import { useSaveVersionRubric } from '../../api/versions';
import { formatNumber } from '../../lib/format';
import { Button, Callout, RichText, Stepper, useFeedback } from '../../ui';
import RubricItemSheet from './RubricItemSheet';

const pts = (v: number) => formatNumber(v, 2);

/** The rubric as a compact editable table: nº · enunciado · solución · puntos. `generated`: saving re-renders the exam
 * to print, and its button says so. `versionKey`: the questions of another version of the exam (always laid out by
 * Sepia). */
export function RubricTable({ activityId, rubric, maxScore, generated, versionKey }: {
  activityId: string; rubric: Rubric; maxScore: number; generated?: boolean; versionKey?: string;
}) {
  const saveExam = useSaveRubric(activityId);
  const saveVersion = useSaveVersionRubric(activityId, versionKey ?? '');
  const save = versionKey ? saveVersion : saveExam;
  const rendered = generated || !!versionKey;
  const { toast } = useFeedback();
  const [items, setItems] = useState<RubricItem[]>(rubric.items);
  const [editing, setEditing] = useState<number | null>(null);
  const source = JSON.stringify(rubric.items);
  useEffect(() => setItems(JSON.parse(source) as RubricItem[]), [source]);

  const dirty = useMemo(() => JSON.stringify(items) !== source, [items, source]);
  const total = items.reduce((s, i) => s + i.points, 0);
  const off = Math.abs(total - maxScore) > 0.001;

  const update = (idx: number, patch: Partial<RubricItem>) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const add = () => {
    const ids = new Set(items.map((i) => i.id));
    let n = items.length + 1;
    while (ids.has(String(n))) n += 1;
    setItems((list) => [...list, { id: String(n), label: String(n), text: '', points: 1, answer: '', steps: [] }]);
    setEditing(items.length);
  };

  const submit = () => save.mutate(items, {
    onSuccess: () => toast(rendered ? 'Rúbrica guardada · examen para imprimir actualizado' : 'Rúbrica guardada'),
    onError: (e) => toast(e.message, { tone: 'error' }),
  });

  return (
    <div className="rubric">
      <div className="list rubric__table">
        <div className="rubric__head" aria-hidden>
          <span>Nº</span><span>Enunciado</span><span className="rubric__sol-col">Solución</span><span>Puntos</span>
        </div>
        {items.map((it, i) => (
          <div key={it.id} className="rubric__row">
            <span className="rubric__n num">{it.label || it.id}</span>
            <button type="button" className="rubric__text" onClick={() => setEditing(i)} aria-label={`Editar pregunta ${it.label || it.id}`}>
              <RichText className="clamp-2" text={it.text || 'Sin enunciado'} />
              <span className="rubric__sol-inline muted clamp-1"><RichText text={it.answer ? `Solución: ${it.answer}` : 'Sin solución'} /></span>
            </button>
            <button type="button" className="rubric__sol muted" onClick={() => setEditing(i)}>
              <RichText className="clamp-2" text={it.answer || '—'} />
            </button>
            <Stepper label={`Puntos de la pregunta ${it.label || it.id}`} value={it.points} min={0.25} max={100} step={0.25} format={pts}
              onChange={(v) => update(i, { points: v })} />
          </div>
        ))}
        <div className="rubric__foot">
          <Button variant="plain" size="sm" icon={<Plus size={16} />} onClick={add}>Añadir pregunta</Button>
          <span className="rubric__total num">Total <b>{pts(total)}</b> / {pts(maxScore)}</span>
        </div>
      </div>
      {off && (
        <Callout tone="warn" icon={<Warning size={18} />}>
          La rúbrica suma {pts(total)} puntos y el examen es sobre {pts(maxScore)}. La nota se ajustará a esa escala.
        </Callout>
      )}
      {dirty && (
        <div className="rubric__actions">
          <Button variant="neutral" onClick={() => setItems(JSON.parse(source) as RubricItem[])}>Descartar cambios</Button>
          <Button onClick={submit} loading={save.isPending}>{rendered ? 'Guardar y actualizar el PDF' : 'Guardar rúbrica'}</Button>
        </div>
      )}
      <RubricItemSheet
        item={editing !== null ? items[editing] ?? null : null}
        onClose={() => setEditing(null)}
        onSave={(patch) => { if (editing !== null) update(editing, patch); setEditing(null); }}
        onDelete={items.length > 1 ? () => { setItems((l) => l.filter((_, i) => i !== editing)); setEditing(null); } : undefined}
      />
    </div>
  );
}
