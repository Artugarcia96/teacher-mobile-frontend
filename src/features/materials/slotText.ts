/** «Editar texto» of a slide, driven by the slot table (GET /content/archetypes, §2.3.3): each slot as the text the
 *  teacher edits (one element per line for lists, with the line syntax of its field), and what the sheet can say
 *  before saving: a refusal for what the slide cannot draw (an empty required slot, a list outside its bounds, an
 *  answer that is not one of the options) and a warning for text over a cap, which is saved anyway. The server parses
 *  the same text and has the last word. */
import type { Column, Item, Slide, SlotField, Step } from '../../api/content';
import { cells, lines, toText, type TextKind } from './fieldText';

/** How a field's lines are written: `items` and `steps` by their `syntax`; every other kind by itself. */
export function lineKind(field: SlotField): TextKind {
  if (field.kind === 'items') {
    if (field.syntax?.startsWith('nivel')) return 'practice';
    if (field.syntax?.startsWith('término')) return 'terms';
    return field.syntax === 'texto' ? 'lines' : 'items';
  }
  if (field.kind === 'steps') return field.syntax === 'cuenta' ? 'lines' : 'steps';
  if (field.kind === 'lines') return 'lines';
  return 'line';
}

/** The text of a field as the sheet shows it; `columns` gives one text per column. */
export function slotToText(field: SlotField, slide: Slide): string | string[] {
  const v = (slide as unknown as Record<string, unknown>)[field.slot];
  if (field.kind === 'columns') return ((v as Column[]) ?? []).map((c) => toText('column', c));
  if (field.kind === 'number') return v == null ? '' : String(v);
  if (field.kind === 'lines') {
    // Callouts are objects: their label is the line.
    return ((v as (string | { label: string })[]) ?? []).map((x) => (typeof x === 'string' ? x : x.label)).join('\n');
  }
  if (field.kind === 'items' && lineKind(field) === 'lines') return ((v as Item[]) ?? []).map((i) => i.text).join('\n');
  if (field.kind === 'steps' && lineKind(field) === 'lines') return ((v as Step[]) ?? []).map((s) => s.show).join('\n');
  if (field.kind === 'items' || field.kind === 'steps') return toText(lineKind(field), v);
  return v == null ? '' : String(v);
}

/** Words as the caps count them: a formula `$…$` is one word. */
export function countWords(text: string): number {
  return text.replace(/\$[^$]*\$/g, ' x ').split(/\s+/).filter(Boolean).length;
}

/** The strings of a field the caps apply to (an item's text, a step's why, a column's cells…). */
function capped(field: SlotField, text: string): string[] {
  const kind = lineKind(field);
  const rows = lines(text);
  if (field.kind === 'text' || field.kind === 'choice') return [text.trim()];
  if (kind === 'items') return rows.map((l) => cells(l)[0]);
  if (kind === 'terms') return rows.map((l) => cells(l).slice(-1)[0]);
  if (kind === 'practice') return rows.map((l) => { const c = cells(l); return /^[123]$/.test(c[0]) && c.length > 1 ? c[1] : c[0]; });
  if (kind === 'steps') return rows.map((l) => cells(l)[1] ?? '').filter(Boolean);
  return rows;
}

export interface SlotCheck { error?: string; warning?: string }

/** What the sheet says under a field. `options`: the current lines of the slot a `choice` picks from. */
export function checkSlot(field: SlotField, value: string | string[], options: string[] = []): SlotCheck {
  if (field.kind === 'columns') {
    const cols = (value as string[]).map((t) => lines(t));
    if (field.required && cols.every((c) => !c.length)) return { error: 'Escribe al menos una columna.' };
    if (field.min && cols.length < field.min) return { error: `Hacen falta ${field.min} columnas.` };
    const words = field.words;
    const long = words ? cols.some((c) => c.slice(1).some((cell) => countWords(cell) > words)) : false;
    return long ? { warning: `Más de ${words} palabras en una celda: puede no caber.` } : {};
  }
  const text = value as string;
  if (field.required && !text.trim()) return { error: 'No puede quedar vacío.' };
  if (field.kind === 'number') {
    if (text.trim() && !/^-?\d+$/.test(text.trim())) return { error: 'Escribe un número entero.' };
    return {};
  }
  if (field.kind === 'choice') {
    const allowed = field.options ?? options;
    if (text.trim() && !allowed.includes(text.trim())) return { error: 'Elige una de las opciones.' };
    return {};
  }
  if (field.kind !== 'text') {
    const n = lines(text).length;
    if (field.min && n < field.min && (n > 0 || field.required)) return { error: `Hacen falta al menos ${field.min} (una por línea).` };
    if (field.max && n > field.max) return { error: `Como mucho ${field.max} (una por línea).` };
    if (lineKind(field) === 'practice' && lines(text).some((l) => !/^[123]$/.test(cells(l)[0]) || cells(l).length < 2)) {
      return { error: 'Cada línea empieza por el nivel (1, 2 o 3): «nivel | texto | respuesta».' };
    }
  }
  const words = field.words;
  if (words && capped(field, text).some((t) => countWords(t) > words)) {
    return { warning: `Más de ${words} palabras: puede no caber en dos líneas` };
  }
  if (field.chars && text.trim().length > field.chars && field.kind === 'text') {
    return { warning: `Más de ${field.chars} caracteres: puede no caber en dos líneas` };
  }
  return {};
}

/** The value PATCH sends for a field: the text as typed (one element per line), a list for columns, a number. */
export function slotValue(field: SlotField, value: string | string[]): string | string[] | number {
  if (field.kind === 'columns') return value as string[];
  if (field.kind === 'number') return Number((value as string).trim() || 0);
  return field.kind === 'text' || field.kind === 'choice' ? (value as string).trim() : lines(value as string).join('\n');
}
