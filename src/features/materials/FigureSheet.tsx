import { useEffect, useMemo, useState } from 'react';
import type { FigureSpec, FigureType } from '../../api/content';
import { useFigurePreview } from '../../api/units';
import { Button, Sheet, Spinner, TextArea, TextField } from '../../ui';
import { Figure } from './Figure';

/** A field of a figure as the teacher writes it: a number, a word, or one element per line in a short pattern. The
 *  spec keeps everything else it had (styles, tangents, dominance…). */
interface Field {
  key: string; label: string; hint?: string; lines?: boolean;
  read: (s: FigureSpec) => string;
  write: (text: string, s: FigureSpec) => Partial<FigureSpec>;
}

const num = (t: string) => {
  const v = Number(t.trim().replace('−', '-').replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(v) ? v : NaN;
};
const numText = (v: unknown) => (typeof v === 'number' ? String(Number(v.toFixed(4))).replace('.', ',') : '');
const lines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);
const arr = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
/** «a: b» → [a, b] (b may be empty). */
const pair = (l: string): [string, string] => {
  const i = l.lastIndexOf(':');
  return i < 0 ? [l.trim(), ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()];
};

const text = (key: string, label: string, hint?: string): Field => ({
  key, label, hint, read: (s) => String(s[key] ?? ''), write: (t) => ({ [key]: t.trim() }),
});
const number = (key: string, label: string, optional = false): Field => ({
  key, label, read: (s) => numText(s[key]),
  write: (t) => ({ [key]: optional && !t.trim() ? null : num(t) }),
});

/** «3/8: tres octavos» per line ⇄ bars or circles. */
const fractions = (key: 'bars' | 'circles'): Field => ({
  key, label: key === 'bars' ? 'Barras' : 'Círculos', lines: true, hint: 'Una por línea: «coloreadas/partes: rótulo», por ejemplo «3/8: tres octavos»',
  read: (s) => arr<{ parts: number; shaded: number; label: string }>(s[key]).map((b) => `${b.shaded}/${b.parts}${b.label ? `: ${b.label}` : ''}`).join('\n'),
  write: (t) => ({
    [key]: lines(t).map((l) => {
      const m = l.match(/^(\d+)\s*\/\s*(\d+)\s*(?::\s*(.*))?$/);
      return m ? { shaded: Number(m[1]), parts: Number(m[2]), label: m[3]?.trim() ?? '' } : { shaded: NaN, parts: NaN, label: l };
    }),
  }),
});

const data: Field = {
  key: 'values', label: 'Datos', lines: true, hint: 'Uno por línea: «etiqueta: valor»',
  read: (s) => arr<string>(s.labels).map((l, i) => `${l}: ${numText(arr<number>(s.values)[i])}`).join('\n'),
  write: (t) => {
    const rows = lines(t).map(pair);
    return { labels: rows.map((r) => r[0]), values: rows.map((r) => num(r[1])) };
  },
};

const FIELDS: Partial<Record<FigureType, Field[]>> = {
  number_line: [
    number('min', 'Desde'), number('max', 'Hasta'), number('step', 'Marcas cada'),
    {
      key: 'points', label: 'Puntos', lines: true, hint: 'Uno por línea: «valor: rótulo»',
      read: (s) => arr<{ value: number; label: string }>(s.points).map((p) => `${numText(p.value)}${p.label ? `: ${p.label}` : ''}`).join('\n'),
      write: (t) => ({ points: lines(t).map((l) => { const [v, label] = l.includes(':') ? pair(l) : [l, '']; return { value: num(v), label }; }) }),
    },
  ],
  fraction_bar: [fractions('bars')],
  fraction_circle: [fractions('circles')],
  bar_chart: [text('title', 'Título'), data, text('x_label', 'Eje horizontal'), text('y_label', 'Eje vertical'), text('unit', 'Unidad')],
  pie_chart: [text('title', 'Título'), data],
  function_plot: [
    {
      key: 'functions', label: 'Funciones', lines: true, hint: 'Una por línea: «expresión: rótulo», por ejemplo «2x^2 - 3x + 1: f»',
      read: (s) => arr<{ expr: string; label: string }>(s.functions).map((f) => `${f.expr}${f.label ? `: ${f.label}` : ''}`).join('\n'),
      write: (t, s) => ({
        functions: lines(t).map((l, i) => {
          const [expr, label] = l.includes(':') ? pair(l) : [l, ''];
          return { ...(arr<object>(s.functions)[i] ?? {}), expr, label };
        }),
      }),
    },
    number('x_min', 'x desde'), number('x_max', 'x hasta'), number('y_min', 'y desde (opcional)', true), number('y_max', 'y hasta (opcional)', true),
  ],
  right_triangle: [
    number('vertical', 'Cateto vertical'), number('horizontal', 'Cateto horizontal'), text('label_vertical', 'Rótulo del cateto vertical'),
    text('label_horizontal', 'Rótulo del cateto horizontal'), text('label_hypotenuse', 'Rótulo de la hipotenusa'),
    text('angle_top', 'Ángulo de arriba'), text('angle_bottom', 'Ángulo de abajo'),
  ],
  table: [
    { key: 'header', label: 'Encabezados', hint: 'Separados por «|»', read: (s) => arr<string>(s.header).join(' | '), write: (t) => ({ header: t.split('|').map((c) => c.trim()) }) },
    {
      key: 'rows', label: 'Filas', lines: true, hint: 'Una fila por línea; las celdas, separadas por «|»',
      read: (s) => arr<string[]>(s.rows).map((r) => r.join(' | ')).join('\n'),
      write: (t) => ({ rows: lines(t).map((l) => l.split('|').map((c) => c.trim())) }),
    },
  ],
  punnett_square: [text('parent1', 'Progenitor 1', 'Genotipo: Aa, AaBb, X^A/X^a'), text('parent2', 'Progenitor 2')],
  timeline: [{
    key: 'events', label: 'Hitos', lines: true,
    hint: 'Uno por línea: «año | rótulo» o «año | fecha como se escribe | rótulo». Antes de Cristo, en negativo: -3000',
    read: (s) => arr<{ year: number; label: string; date_label: string }>(s.events)
      .map((e) => [numText(e.year), e.date_label, e.label].filter(Boolean).join(' | ')).join('\n'),
    write: (t) => ({
      events: lines(t).map((l) => {
        const p = l.split('|').map((c) => c.trim());
        return p.length >= 3 ? { year: num(p[0]), date_label: p[1], label: p.slice(2).join(' | ') } : { year: num(p[0]), date_label: '', label: p[1] ?? '' };
      }),
    }),
  }],
  tree: [{
    key: 'nodes', label: 'Esquema', lines: true, hint: 'Un recuadro por línea; sangra con dos espacios los que cuelgan del de arriba',
    read: (s) => {
      const nodes = arr<{ id: string; label: string; parent: string }>(s.nodes);
      const out: string[] = [];
      const walk = (parent: string, depth: number) => nodes.filter((n) => (n.parent || '') === parent).forEach((n) => {
        out.push(`${'  '.repeat(depth)}${n.label}`);
        walk(n.id, depth + 1);
      });
      walk('', 0);
      return out.join('\n');
    },
    write: (t) => {
      const stack: { depth: number; id: string }[] = [];
      const nodes = t.split('\n').filter((l) => l.trim()).map((l, i) => {
        const depth = Math.floor((l.length - l.trimStart().length) / 2);
        while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
        const id = `n${i + 1}`;
        const node = { id, label: l.trim(), parent: stack[stack.length - 1]?.id ?? '' };
        stack.push({ depth, id });
        return node;
      });
      return { nodes };
    },
  }],
};

const NONE: Field[] = [];

/** Figures the teacher edits by hand; the rest (pedigrees, anatomy and lab diagrams) change with «Reescribir con IA». */
export function canEditFigure(spec: FigureSpec): boolean {
  return spec.type in FIELDS;
}

/** «Editar figura»: its data as short text fields with the drawing as the server makes it (the same as the PDF). */
export default function FigureSheet({ spec, caption, saving, onSave, onClose }: {
  spec: FigureSpec; caption?: string; saving: boolean; onSave: (spec: FigureSpec, caption?: string) => void; onClose: () => void;
}) {
  const fields = FIELDS[spec.type] ?? NONE;
  const initial = Object.fromEntries(fields.map((f) => [f.key, f.read(spec)]));
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [cap, setCap] = useState(caption ?? '');
  const next = useMemo(() => fields.reduce<FigureSpec>((s, f) => ({ ...s, ...f.write(values[f.key], s) }), spec), [fields, values, spec]);
  const [shown, setShown] = useState<FigureSpec>(next);
  useEffect(() => {
    const t = setTimeout(() => setShown(next), 450);
    return () => clearTimeout(t);
  }, [next]);
  const preview = useFigurePreview(shown);
  const error = preview.error ? (preview.error as Error).message : null;
  const dirty = fields.some((f) => values[f.key] !== initial[f.key]) || cap !== (caption ?? '');
  const settled = shown === next && !preview.isFetching;

  return (
    <Sheet open onClose={onClose} title="Editar figura" size="large" dirty={dirty}
      footer={<Button full loading={saving} disabled={!dirty || !!error || !settled}
        onClick={() => !saving && onSave(next, caption === undefined ? undefined : cap.trim())}>
        {error ? 'Revisa los datos' : dirty ? 'Guardar figura' : 'Sin cambios'}
      </Button>}>
      <div className="form">
        <div className="figure-preview" aria-live="polite">
          {error ? <p className="figure-preview__error">{error}</p>
            : preview.data ? <Figure svg={preview.data.svg} label="Vista previa de la figura" /> : <Spinner />}
        </div>
        {fields.map((f, i) => {
          const common = {
            label: f.label, hint: f.hint, value: values[f.key],
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
            ...(i === 0 ? { 'data-autofocus': true } : {}),
          };
          return f.lines
            ? <TextArea key={f.key} {...common} rows={Math.min(12, Math.max(3, values[f.key].split('\n').length + 1))} />
            : <TextField key={f.key} {...common} />;
        })}
        {caption !== undefined && <TextField label="Pie de la figura" value={cap} onChange={(e) => setCap(e.target.value)} maxLength={200} />}
      </div>
    </Sheet>
  );
}
