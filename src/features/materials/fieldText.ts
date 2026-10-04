import type { Column, Item, Step } from '../../api/content';

/** How the edit sheets write a field as text: one line, a paragraph, one item per line, the cells of one row, a table
 *  (one row per line) or pairs («izquierda | derecha»). Lists of a slide use the line syntax of the slot table:
 *  `items` «texto | respuesta», `terms` (a `lista`) «término | texto», `practice` (a `practica`) «nivel | texto |
 *  respuesta», `steps` «cuenta | por qué», and a `column` is its heading on the first line and a cell per line after it.
 *  Cells are separated by « | » with a space on each side, so an absolute value |x| stays in its cell. */
export type TextKind = 'line' | 'area' | 'lines' | 'cells' | 'rows' | 'pairs' | 'items' | 'terms' | 'practice' | 'steps' | 'column';

export const lines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** The cells of one line: a «|» is a separator when it has a space (or the start or end of the line) on each side. */
export function cells(line: string): string[] {
  const out: string[] = [];
  let cell = '';
  for (let i = 0; i < line.length; i++) {
    const separator = line[i] === '|' && (i === 0 || line[i - 1] === ' ') && (i === line.length - 1 || line[i + 1] === ' ');
    if (separator) {
      out.push(cell.trim());
      cell = '';
    } else cell += line[i];
  }
  out.push(cell.trim());
  return out;
}

const joined = (parts: string[]) => {
  const out = [...parts];
  while (out.length > 1 && !out[out.length - 1]) out.pop();
  return out.join(' | ');
};
const ITEM: Item = { text: '', answer: '', term: '', level: 0, prose: false };
const STEP: Step = { show: '', say: '', phase: '' };

export function toText(kind: TextKind, v: unknown): string {
  if (kind === 'lines') return ((v as string[]) ?? []).join('\n');
  if (kind === 'cells') return ((v as string[]) ?? []).join(' | ');
  if (kind === 'rows' || kind === 'pairs') return ((v as string[][]) ?? []).map((r) => r.join(' | ')).join('\n');
  if (kind === 'items') return ((v as Item[]) ?? []).map((i) => joined([i.text, i.answer])).join('\n');
  if (kind === 'terms') return ((v as Item[]) ?? []).map((i) => joined([i.term, i.text])).join('\n');
  if (kind === 'practice') return ((v as Item[]) ?? []).map((i) => joined([String(i.level || 1), i.text, i.answer])).join('\n');
  if (kind === 'steps') return ((v as Step[]) ?? []).map((s) => joined([s.show, s.say])).join('\n');
  if (kind === 'column') {
    const c = v as Column | undefined;
    return c ? [c.heading, ...c.cells].join('\n') : '';
  }
  return String(v ?? '');
}

/** The value of a field from its text. `prev`: the value it had, so what the text does not show (an item's level, a
 *  step's phase, a column's image) stays with the element in the same place. */
export function fromText(kind: TextKind, text: string, prev?: unknown): unknown {
  if (kind === 'lines') return lines(text);
  if (kind === 'cells') return cells(text).filter(Boolean);
  if (kind === 'rows') return lines(text).map(cells);
  if (kind === 'pairs') return lines(text).map(cells).filter((p) => p.length === 2 && p[0] && p[1]);
  if (kind === 'items' || kind === 'terms' || kind === 'practice') {
    const before = (prev as Item[] | undefined) ?? [];
    return lines(text).map((l, i) => {
      const c = cells(l);
      const item = { ...ITEM, ...before[i] };
      if (kind === 'items') return { ...item, text: c[0], answer: c.slice(1).join(' | ') };
      if (kind === 'terms') return c.length > 1 ? { ...item, term: c[0], text: c.slice(1).join(' | ') } : { ...item, term: '', text: c[0] };
      const level = Number(c[0]);
      return [1, 2, 3].includes(level) && c.length > 1
        ? { ...item, level, text: c[1], answer: c.slice(2).join(' | ') }
        : { ...item, level: item.level || 1, text: c[0], answer: c.slice(1).join(' | ') };
    });
  }
  if (kind === 'steps') {
    const before = (prev as Step[] | undefined) ?? [];
    return lines(text).map((l, i) => {
      const c = cells(l);
      return { ...STEP, ...before[i], show: c[0], say: c.slice(1).join(' | ') };
    });
  }
  if (kind === 'column') {
    const [heading = '', ...rest] = lines(text);
    return { image_id: '', ...(prev as Column | undefined), heading, cells: rest };
  }
  return text.trim();
}
