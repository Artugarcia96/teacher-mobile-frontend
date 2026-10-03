import { useState } from 'react';
import { isSlide, type Block, type Element, type Slide, type SlideNotes } from '../../api/content';
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

const NOTES: [keyof Omit<SlideNotes, 'clicks'>, string][] = [
  ['say', 'Di'], ['ask', 'Pregunta'], ['expected', 'Respuesta esperada'], ['misconception', 'Error frecuente'],
  ['if_not', 'Si no lo entienden'], ['manage', 'Gestión'], ['source_note', 'Dato para ti'],
];

/** The slots of a slide that hold text, in slot order (lists one element per line), then its notes. */
function slideFields(s: Slide): Field[] {
  const f: Field[] = [];
  const text = (path: keyof Slide, label: string, kind: TextKind = 'line') => {
    if (s[path]) f.push({ path, label, kind });
  };
  text('headline', 'Titular', 'area');
  text('term', 'Término');
  text('number', 'Número');
  text('attribution', 'Fuente del dato');
  text('text', 'Texto', 'area');
  if (s.items.length) {
    f.push(s.archetype === 'lista' ? { path: 'items', label: 'Elementos', kind: 'terms', hint: 'Uno por línea: «término | texto»' }
      : s.archetype === 'practica' ? { path: 'items', label: 'Ejercicios', kind: 'practice', hint: 'Uno por línea: «nivel | texto | respuesta», con el nivel de 1 a 3' }
        : { path: 'items', label: 'Elementos', kind: 'items', hint: 'Uno por línea: «texto | respuesta»' });
  }
  s.columns.forEach((_, i) => f.push({ path: `columns.${i}`, label: `Columna ${i + 1}`, kind: 'column', hint: 'El encabezado en la primera línea; después, una celda por línea' }));
  if (s.steps.length) f.push({ path: 'steps', label: 'Pasos', kind: 'steps', hint: 'Uno por línea: «cuenta | por qué»' });
  if (s.options.length) f.push({ path: 'options', label: 'Opciones', kind: 'lines', hint: 'Una por línea' });
  text('answer', 'Respuesta correcta');
  text('explanation', 'Explicación', 'area');
  text('yes', 'Sí es…');
  text('no', 'No es…');
  text('aside', 'Línea secundaria');
  for (const [k, label] of NOTES) if (k === 'say' || s.notes[k]) f.push({ path: `notes.${k}`, label, kind: 'area' });
  return f;
}

/** The fields the teacher can edit in an element (the figure has its own sheet). */
export function fieldsOf(el: Element): Field[] {
  if (isSlide(el)) return slideFields(el);
  switch (el.type) {
    case 'text': return [{ path: 'text', label: 'Texto', kind: 'area' }];
    case 'definition': return [{ path: 'term', label: 'Término', kind: 'line' }, { path: 'text', label: 'Definición', kind: 'area' }];
    case 'worked': return [
      { path: 'title', label: 'Título', kind: 'line' }, { path: 'statement', label: 'Enunciado', kind: 'area' },
      { path: 'steps', label: 'Pasos', kind: 'steps', hint: 'Uno por línea: «cuenta | por qué»' }, { path: 'close', label: 'Resultado', kind: 'line' },
    ];
    case 'note': return [{ path: 'text', label: 'Texto', kind: 'area' }];
    case 'list': return [{ path: 'title', label: 'Título', kind: 'line' }, { path: 'items', label: 'Elementos', kind: 'lines', hint: LINES }];
    case 'table': return [
      { path: 'header', label: 'Encabezados', kind: 'cells', hint: 'Separados por « | », con un espacio a cada lado' }, { path: 'rows', label: 'Filas', kind: 'rows', hint: ROWS },
      { path: 'caption', label: 'Pie', kind: 'line' },
    ];
    case 'figure': return [{ path: 'caption', label: 'Pie de la figura', kind: 'line' }];
    case 'your_turn': case 'review': return [{ path: 'items', label: 'Preguntas', kind: 'items', hint: QUESTIONS }];
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

/** «Editar texto» of one block or slide: its fields as plain text (lists one per line), saved as the whole element. */
export default function EditElementSheet({ el, saving, onSave, onClose }: {
  el: Element; saving: boolean; onSave: (el: Element) => void; onClose: () => void;
}) {
  const fields = fieldsOf(el);
  const initial = Object.fromEntries(fields.map((f) => [f.path, toText(f.kind, get(el, f.path))]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const dirty = fields.some((f) => values[f.path] !== initial[f.path]);
  const math = JSON.stringify(el).includes('$');
  const what = isSlide(el) ? 'diapositiva' : el.type === 'exercise' ? 'ejercicio' : 'apartado';

  const save = () => {
    if (saving) return;
    onSave(fields.reduce<Element>((acc, f) => set(acc, f.path, fromText(f.kind, values[f.path], get(el, f.path))), el));
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
