import { useState } from 'react';
import type { Block, Element, Slide } from '../../api/content';
import { Button, RichText, Sheet, TextArea, TextField } from '../../ui';

/** How a field is written in the form: one line, a paragraph, one item per line, cells split by «|», or a table
 *  (one row per line, cells split by «|»). */
type Kind = 'line' | 'area' | 'lines' | 'cells' | 'rows' | 'pairs';
interface Field { path: string; label: string; kind: Kind; hint?: string }

const LINES = 'Uno por línea';
const ROWS = 'Una fila por línea; las celdas, separadas por «|»';

function exerciseFields(b: Extract<Block, { type: 'exercise' }>): Field[] {
  const f: Field[] = [{ path: 'statement', label: 'Enunciado', kind: 'area' }];
  if (b.passage) f.push({ path: 'passage', label: 'Texto', kind: 'area' });
  if (b.item_type === 'relacionar') f.push({ path: 'pairs', label: 'Parejas correctas', kind: 'pairs', hint: 'Una por línea: «izquierda | derecha». Se imprimen desordenadas' });
  else if (b.items.length || !b.options.length) f.push({ path: 'items', label: b.item_type === 'ordenar' ? 'Elementos, en el orden correcto' : 'Apartados', kind: 'lines', hint: LINES });
  if (b.options.length) f.push({ path: 'options', label: 'Opciones', kind: 'lines', hint: LINES });
  if (b.categories.length) f.push({ path: 'categories', label: 'Categorías', kind: 'lines', hint: LINES });
  if (b.item_answers.length) f.push({ path: 'item_answers', label: 'Solución de cada apartado', kind: 'lines', hint: 'Una por línea, en el orden de los apartados' });
  if (b.answer || !b.item_answers.length) f.push({ path: 'answer', label: 'Solución', kind: 'area' });
  if (b.steps.length) f.push({ path: 'steps', label: 'Pasos de la solución', kind: 'lines', hint: LINES });
  return f;
}

function slideFields(s: Slide): Field[] {
  const f: Field[] = [{ path: 'title', label: 'Título', kind: 'line' }];
  if (s.layout === 'section' || s.subtitle) f.push({ path: 'subtitle', label: 'Subtítulo', kind: 'line' });
  if (s.bullets.length || ['bullets', 'bullets_figure', 'summary', 'practice'].includes(s.layout)) {
    f.push({ path: 'bullets', label: s.layout === 'practice' ? 'Ejercicios' : 'Viñetas', kind: 'lines', hint: 'Una por línea' });
  }
  if (s.layout === 'practice' || s.answers.length) f.push({ path: 'answers', label: 'Soluciones', kind: 'lines', hint: 'Una por línea, en el orden de los ejercicios' });
  if (s.left) f.push({ path: 'left.heading', label: 'Columna izquierda', kind: 'line' }, { path: 'left.bullets', label: 'Viñetas de la izquierda', kind: 'lines' });
  if (s.right) f.push({ path: 'right.heading', label: 'Columna derecha', kind: 'line' }, { path: 'right.bullets', label: 'Viñetas de la derecha', kind: 'lines' });
  if (s.example) {
    f.push({ path: 'example.statement', label: 'Enunciado del ejemplo', kind: 'area' }, { path: 'example.steps', label: 'Pasos', kind: 'lines', hint: 'Uno por línea' },
      { path: 'example.result', label: 'Resultado', kind: 'line' });
  }
  if (s.question) {
    f.push({ path: 'question.prompt', label: 'Pregunta', kind: 'area' });
    if (s.question.options.length) f.push({ path: 'question.options', label: 'Opciones', kind: 'lines', hint: 'Una por línea' });
    f.push({ path: 'question.answer', label: 'Respuesta', kind: 'line' });
  }
  if (s.figure) f.push({ path: 'caption', label: 'Pie de la figura', kind: 'line' });
  f.push({ path: 'notes', label: 'Notas del orador', kind: 'area' });
  return f;
}

/** The fields the teacher can edit in an element (the figure has its own sheet). */
export function fieldsOf(el: Element): Field[] {
  if ('layout' in el) return slideFields(el);
  switch (el.type) {
    case 'text': return [{ path: 'text', label: 'Texto', kind: 'area' }];
    case 'definition': return [{ path: 'term', label: 'Término', kind: 'line' }, { path: 'text', label: 'Definición', kind: 'area' }];
    case 'example': return [
      { path: 'title', label: 'Título', kind: 'line' }, { path: 'statement', label: 'Enunciado', kind: 'area' },
      { path: 'steps', label: 'Pasos', kind: 'lines', hint: LINES }, { path: 'result', label: 'Resultado', kind: 'line' },
    ];
    case 'note': return [{ path: 'text', label: 'Texto', kind: 'area' }];
    case 'list': return [{ path: 'title', label: 'Título', kind: 'line' }, { path: 'items', label: 'Elementos', kind: 'lines', hint: LINES }];
    case 'table': return [
      { path: 'header', label: 'Encabezados', kind: 'cells', hint: 'Separados por «|»' }, { path: 'rows', label: 'Filas', kind: 'rows', hint: ROWS },
      { path: 'caption', label: 'Pie', kind: 'line' },
    ];
    case 'figure': return [{ path: 'caption', label: 'Pie de la figura', kind: 'line' }];
    case 'check': return [{ path: 'question', label: 'Pregunta', kind: 'area' }, { path: 'answer', label: 'Respuesta', kind: 'area' }];
    case 'exercise': return exerciseFields(el);
  }
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], obj);
}

function set<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const o = obj as Record<string, unknown>;
  return { ...o, [head]: rest.length ? set(o[head], rest.join('.'), value) : value } as T;
}

const clean = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);
const cells = (line: string) => line.split('|').map((c) => c.trim());

function toText(kind: Kind, v: unknown): string {
  if (kind === 'lines') return ((v as string[]) ?? []).join('\n');
  if (kind === 'cells') return ((v as string[]) ?? []).join(' | ');
  if (kind === 'rows' || kind === 'pairs') return ((v as string[][]) ?? []).map((r) => r.join(' | ')).join('\n');
  return String(v ?? '');
}

function fromText(kind: Kind, text: string): unknown {
  if (kind === 'lines') return clean(text);
  if (kind === 'cells') return cells(text).filter(Boolean);
  if (kind === 'rows') return clean(text).map(cells);
  if (kind === 'pairs') return clean(text).map(cells).filter((p) => p.length === 2 && p[0] && p[1]);
  return text.trim();
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
  const what = 'layout' in el ? 'diapositiva' : el.type === 'exercise' ? 'ejercicio' : 'apartado';

  const save = () => {
    if (saving) return;
    onSave(fields.reduce<Element>((acc, f) => set(acc, f.path, fromText(f.kind, values[f.path])), el));
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
