import { Plus, Warning } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { useSaveRubric, type Rubric, type RubricItem } from '../../api/papers';
import { useSaveVersionRubric } from '../../api/versions';
import { formatNumber } from '../../lib/format';
import { Button, Callout, RichText, Stepper, useFeedback } from '../../ui';
import RubricItemSheet from './RubricItemSheet';

const pts = (v: number) => formatNumber(v, 2);
const POINTS_DELAY = 800; // ms: a run of taps on a stepper is one save

/** The rubric as a compact editable table: nº · enunciado · solución · puntos. Every change is saved at once (a
 * question with «Hecho», points after a short pause, adding or removing a question), so Modelo B, the adapted versions
 * and printing always start from what the teacher sees. `generated`: saving lays the exam out again, and the toast
 * says so. `versionKey`: the questions of another version of the exam (always laid out by Sepia). */
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
  const [adding, setAdding] = useState(false);
  const queued = useRef<{ items: RubricItem[]; label: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const saving = useRef(false);
  const source = JSON.stringify(rubric.items);
  // Follow the server, except while a change of the teacher's is on its way (it would come back without it).
  useEffect(() => {
    if (!queued.current && !saving.current) setItems(JSON.parse(source) as RubricItem[]);
  }, [source]);

  const total = items.reduce((s, i) => s + i.points, 0);
  const off = Math.abs(total - maxScore) > 0.001;
  const name = (it: RubricItem) => it.label || it.id;

  // On error the teacher's change stays on screen (nothing is lost); the toast says why it was not saved.
  const persist = (next: RubricItem[], done: string) => {
    saving.current = true;
    save.mutate(next, {
      onSuccess: () => toast(rendered ? `${done} · PDF actualizado` : done),
      onError: (e) => toast(e.message, { tone: 'error' }),
      onSettled: () => { saving.current = false; },
    });
  };
  const flush = () => {
    window.clearTimeout(timer.current);
    const q = queued.current;
    queued.current = null;
    if (q) persist(q.items, q.label);
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []); // leaving before the pause: the last points still reach the server

  const setPoints = (idx: number, points: number) => {
    const next = items.map((it, i) => (i === idx ? { ...it, points } : it));
    setItems(next);
    queued.current = { items: next, label: `Pregunta ${name(next[idx])} guardada` };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, POINTS_DELAY);
  };
  const saveNow = (next: RubricItem[], label: string) => {
    window.clearTimeout(timer.current);
    queued.current = null; // `next` carries any points still waiting
    setItems(next);
    persist(next, label);
  };

  const add = () => {
    const ids = new Set(items.map((i) => i.id));
    let n = items.length + 1;
    while (ids.has(String(n))) n += 1;
    setItems((list) => [...list, { id: String(n), label: String(n), text: '', points: 1, answer: '', steps: [] }]);
    setAdding(true);
    setEditing(items.length);
  };
  const close = () => { // a question added and never finished is not kept
    if (adding) setItems((list) => list.slice(0, -1));
    setAdding(false);
    setEditing(null);
  };
  const onSave = (patch: Partial<RubricItem>) => {
    if (editing === null) return;
    const it = items[editing];
    const changed = adding || (Object.keys(patch) as (keyof RubricItem)[]).some((k) => patch[k] !== it[k]);
    if (changed) {
      saveNow(items.map((x, i) => (i === editing ? { ...x, ...patch } : x)),
        `Pregunta ${name(it)} ${adding ? 'añadida' : 'guardada'}`);
    }
    setAdding(false);
    setEditing(null);
  };
  const onDelete = () => {
    if (editing === null) return;
    const it = items[editing];
    if (!adding) saveNow(items.filter((_, i) => i !== editing), `Pregunta ${name(it)} quitada`);
    else setItems((list) => list.slice(0, -1));
    setAdding(false);
    setEditing(null);
  };

  return (
    <div className="rubric">
      <div className="list rubric__table">
        <div className="rubric__head" aria-hidden>
          <span>Nº</span><span>Enunciado</span><span className="rubric__sol-col">Solución</span><span>Puntos</span>
        </div>
        {items.map((it, i) => (
          <div key={it.id} className="rubric__row">
            <span className="rubric__n num">{name(it)}</span>
            <button type="button" className="rubric__text" onClick={() => setEditing(i)} aria-label={`Editar pregunta ${name(it)}`}>
              <RichText className="clamp-2" text={it.text || 'Sin enunciado'} />
              <span className="rubric__sol-inline muted clamp-1"><RichText text={it.answer ? `Solución: ${it.answer}` : 'Sin solución'} /></span>
            </button>
            <button type="button" className="rubric__sol muted" onClick={() => setEditing(i)}>
              <RichText className="clamp-2" text={it.answer || '—'} />
            </button>
            <Stepper label={`Puntos de la pregunta ${name(it)}`} value={it.points} min={0.25} max={100} step={0.25} format={pts}
              onChange={(v) => setPoints(i, v)} />
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
      <RubricItemSheet
        item={editing !== null ? items[editing] ?? null : null}
        isNew={adding}
        onClose={close}
        onSave={onSave}
        onDelete={items.length > 1 || adding ? onDelete : undefined}
      />
    </div>
  );
}
