import { useState } from 'react';
import type { Block } from '../../api/content';
import { fromText, toText, type TextKind } from '../../features/materials/fieldText';
import { Button, RichText, Sheet, TextArea, TextField } from '../../ui';

interface Field { path: string; label: string; kind: TextKind; hint?: string }

const LINES = 'Uno por línea';
const ROWS = 'Una fila por línea; las celdas, separadas por « | », con un espacio a cada lado';
const QUESTIONS = 'Una por línea: «pregunta | respuesta»';

function exerciseFields(b: Extract<Block, { type: 'exercise' }>): Field[] {
  const f: Field[] = [{ path: 'statement', label: 'Enunciado', kind: 'area' }];
  if (b.passage) f.push({ path: 'passage', label: 'Texto', kind: 'area' });
  if (b.item_type === 'relacionar') f.push({ path: 'pairs', label: 'Parejas correctas', kind: 'pairs', hint: 'Una por línea: «izquierda | derecha», con un espacio a cada lado de «|». Se imprimen desordenadas' });
  else if (b.items.length || !b.options.length) f.push({ path: 'items', label: b.item_type === 'ordenar' ? 'Elementos, en el orden correcto' : 'Apartados', kind: 'lines', hint: LINES });
  if (b.options.length) f.push({ path: 'options', label: 'Opciones', kind: 'lines', hint: LINES });
  if (b.categories.length) f.push({ path: 'categories', label: 'Categorías', kind: 'lines', hint: LINES });
  if (b.item_answers.length) f.push({ path: 'item_answers', label: 'Solución de cada apartado', kind: 'lines', hint: 'Una por línea, en el orden de los apartados' });
  if (b.answer || !b.item_answers.length) f.push({ path: 'answer', label: 'Solución', kind: 'area' });
  if (b.steps.length) f.push({ path: 'steps', label: 'Pasos de la solución', kind: 'lines', hint: LINES });
  return f;
}

/** The fields the teacher can edit in a block (the figure has its own sheet; slides have «Editar texto» from the slot
 *  table). */
function fieldsOf(el: Block): Field[] {
  switch (el.type) {
    case 'text': return [{ path: 'text', label: 'Texto', kind: 'area' }];
    case 'definition': return [{ path: 'term', label: 'Término', kind: 'line' }, { path: 'text', label: 'Definición', kind: 'area' }];
    case 'worked': return [
      { path: 'title', label: 'Título', kind: 'line' }, { path: 'statement', label: 'Enunciado', kind: 'area' },
      { path: 'steps', label: 'Pasos', kind: 'steps', hint: 'Uno por línea: «cuenta | por qué»' }, { path: 'close', label: 'Resultado', kind: 'line' },
    ];
    case 'note': return [
      { path: 'text', label: 'Texto', kind: 'area' },
      ...(el.tone === 'error' ? [
        { path: 'wrong', label: 'Cómo lo escribe el alumno', kind: 'line' as const }, { path: 'right', label: 'Cómo es', kind: 'line' as const },
        { path: 'check', label: 'Cómo comprobarlo', kind: 'area' as const },
      ] : []),
      ...(el.tone === 'fact' ? [{ path: 'source', label: 'Fuente', kind: 'line' as const }] : []),
    ];
    case 'list': return [{ path: 'title', label: 'Título', kind: 'line' }, { path: 'items', label: 'Elementos', kind: 'lines', hint: LINES }];
    case 'table': return [
      { path: 'header', label: 'Encabezados', kind: 'cells', hint: 'Separados por « | », con un espacio a cada lado' }, { path: 'rows', label: 'Filas', kind: 'rows', hint: ROWS },
      { path: 'caption', label: 'Pie', kind: 'line' },
    ];
    case 'figure': case 'image': return [{ path: 'caption', label: 'Pie', kind: 'line' }];
    case 'your_turn': return [{ path: 'items', label: 'Preguntas', kind: 'items', hint: QUESTIONS }];
    case 'source': return [{ path: 'questions', label: 'Preguntas sobre el documento', kind: 'items', hint: QUESTIONS }];
    case 'essentials': return [{ path: 'items', label: 'Ideas', kind: 'lines', hint: LINES }];
    case 'case': return [
      { path: 'title', label: 'Título', kind: 'line' }, { path: 'text', label: 'Caso', kind: 'area' },
      { path: 'questions', label: 'Preguntas', kind: 'items', hint: QUESTIONS },
    ];
    case 'exercise': return exerciseFields(el);
    default: return [];
  }
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], obj);
}

function set<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const o = obj as Record<string, unknown>;
  const v = rest.length ? set(o[head], rest.join('.'), value) : value;
  if (Array.isArray(obj)) return obj.map((x, i) => (i === Number(head) ? v : x)) as T;
  return { ...o, [head]: v } as T;
}

/** «Editar texto» of one block: its fields as plain text (lists one per line), saved as the whole element. */
export default function EditElementSheet({ el, saving, onSave, onClose }: {
  el: Block; saving: boolean; onSave: (el: Block) => void; onClose: () => void;
}) {
  const fields = fieldsOf(el);
  const initial = Object.fromEntries(fields.map((f) => [f.path, toText(f.kind, get(el, f.path))]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const dirty = fields.some((f) => values[f.path] !== initial[f.path]);
  const math = JSON.stringify(el).includes('$');
  const what = el.type === 'exercise' ? 'ejercicio' : 'apartado';

  const save = () => {
    if (saving) return;
    onSave(fields.reduce<Block>((acc, f) => set(acc, f.path, fromText(f.kind, values[f.path], get(el, f.path))), el));
  };

  return (
    <Sheet open onClose={onClose} title={`Editar ${what}`} size="large" dirty={dirty}
      subtitle={math ? 'Las fórmulas van entre $…$, por ejemplo $\\frac{3}{4}$.' : undefined}
      footer={<Button full onClick={save} loading={saving} disabled={!dirty}>{dirty ? 'Guardar cambios' : 'Sin cambios'}</Button>}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {fields.map((f, i) => {
          const common = {
            label: f.label, hint: f.hint, value: values[f.path],
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.path]: e.target.value })),
            ...(i === 0 ? { 'data-autofocus': true } : {}),
          };
          const input = f.kind === 'line' || f.kind === 'cells'
            ? <TextField {...common} />
            : <TextArea {...common} rows={Math.min(10, Math.max(2, values[f.path].split('\n').length + 1))} />;
          // Formulas are written in LaTeX: how they will look, under the field.
          return (
            <div key={f.path} className="edit-field">
              {input}
              {values[f.path].includes('$') && <RichText as="div" className="edit-field__preview" text={values[f.path]} />}
            </div>
          );
        })}
      </form>
    </Sheet>
  );
}
