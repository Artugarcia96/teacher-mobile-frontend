import { describe, expect, it } from 'vitest';
import type { Slide, SlotField } from '../../api/content';
import { checkSlot, countWords, lineKind, slotToText, slotValue } from './slotText';

const item = (text: string, answer = '', extra: Partial<{ term: string; level: number }> = {}) =>
  ({ text, answer, term: extra.term ?? '', level: extra.level ?? 0, prose: false });

const slide = (patch: Partial<Slide>): Slide => ({
  id: 'd1-3', lesson: 1, archetype: 'bisagra', headline: '', text: '', aside: '', term: '', number: '', attribution: '', items: [],
  columns: [], row_labels: [], options: [], answer: '', explanation: '', distractor_misconceptions: [], steps: [], wrong_step: 0,
  yes: '', no: '', source_id: '', highlight: '', figure: null, image_id: '', image_need: null, link_id: '', link_url: '', callouts: [],
  reveal: [], minutes: 2, hidden: false, backup_for: '',
  notes: { say: '', ask: '', expected: '', misconception: '', clicks: [], if_not: '', manage: '', source_note: '' },
  ...patch,
});

const headline: SlotField = { slot: 'headline', label: 'Titular', kind: 'text', words: 15, chars: 90, required: true };
const options: SlotField = { slot: 'options', label: 'Opciones (una por línea)', kind: 'lines', min: 3, max: 4, words: 8 };
const answer: SlotField = { slot: 'answer', label: 'Respuesta correcta', kind: 'choice', from: 'options' };
const practice: SlotField = { slot: 'items', label: 'Ejercicios', kind: 'items', min: 3, max: 6, words: 20, syntax: 'nivel | texto | respuesta' };
const steps: SlotField = { slot: 'steps', label: 'Pasos', kind: 'steps', min: 3, max: 6, words: 6, syntax: 'cuenta | por qué' };
const columns: SlotField = { slot: 'columns', label: 'Columnas', kind: 'columns', min: 2, max: 2, words: 6, required: true };

describe('slot sheet line syntax', () => {
  it('writes each slot as the teacher edits it', () => {
    const s = slide({
      options: ['1/2', '2/4', '3/5'], answer: '2/4',
      items: [item('Simplifica 6/8', '3/4', { level: 1 }), item('Compara 2/3 y 3/4', '3/4', { level: 2 })],
      steps: [{ show: '$\\frac{6}{8}$', say: 'Divide entre 2', phase: '' }],
      columns: [{ heading: 'Propias', cells: ['1/2', '3/4'], image_id: '' }, { heading: 'Impropias', cells: ['5/4'], image_id: '' }],
      callouts: [{ label: 'Numerador', anchor: 'fig:n' }],
    });
    expect(slotToText(options, s)).toBe('1/2\n2/4\n3/5');
    expect(slotToText(answer, s)).toBe('2/4');
    expect(slotToText(practice, s)).toBe('1 | Simplifica 6/8 | 3/4\n2 | Compara 2/3 y 3/4 | 3/4');
    expect(slotToText(steps, s)).toBe('$\\frac{6}{8}$ | Divide entre 2');
    expect(slotToText(columns, s)).toEqual(['Propias\n1/2\n3/4', 'Impropias\n5/4']);
    expect(slotToText({ slot: 'callouts', label: 'Rótulos', kind: 'lines', max: 3 }, s)).toBe('Numerador');
  });

  it('reads the line syntax of items and steps from the field', () => {
    expect(lineKind(practice)).toBe('practice');
    expect(lineKind({ ...practice, syntax: 'término | texto' })).toBe('terms');
    expect(lineKind({ ...practice, syntax: 'texto | respuesta' })).toBe('items');
    expect(lineKind({ ...practice, syntax: 'texto' })).toBe('lines');
    expect(lineKind(steps)).toBe('steps');
    expect(lineKind({ ...steps, syntax: 'cuenta' })).toBe('lines');
  });

  it('refuses what the slide cannot draw', () => {
    expect(checkSlot(headline, '  ').error).toBe('No puede quedar vacío.');
    expect(checkSlot(options, 'a\nb').error).toMatch(/al menos 3/);
    expect(checkSlot(options, 'a\nb\nc\nd\ne').error).toMatch(/Como mucho 4/);
    expect(checkSlot(answer, '3/7', ['1/2', '2/4']).error).toBe('Elige una de las opciones.');
    expect(checkSlot(answer, '2/4', ['1/2', '2/4'])).toEqual({});
    expect(checkSlot(practice, 'Simplifica 6/8 | 3/4\n2 | b | c\n3 | d | e').error).toMatch(/nivel/);
    expect(checkSlot(columns, ['', '']).error).toBe('Escribe al menos una columna.');
    expect(checkSlot({ slot: 'wrong_step', label: 'Paso equivocado', kind: 'number' }, 'dos').error).toBe('Escribe un número entero.');
  });

  it('warns over a word cap and saves anyway', () => {
    const long = 'una dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis';
    expect(checkSlot(headline, long).warning).toBe('Más de 15 palabras: puede no caber en dos líneas');
    expect(checkSlot(headline, long).error).toBeUndefined();
    const three = (why: string) => `$a$ | ${why}\n$b$ | corto\n$c$ | corto`;
    expect(checkSlot(steps, three('uno dos tres cuatro cinco seis siete')).warning).toMatch(/6 palabras/);
    expect(checkSlot(steps, three('por qué'))).toEqual({});
  });

  it('counts a formula as one word', () => {
    expect(countWords('Suma $\\frac{1}{2} + \\frac{1}{3}$ ya')).toBe(3);
  });

  it('sends text per line, a list per column and numbers', () => {
    expect(slotValue(options, ' 1/2 \n\n2/4\n')).toBe('1/2\n2/4');
    expect(slotValue(columns, ['A\nb', 'C'])).toEqual(['A\nb', 'C']);
    expect(slotValue({ slot: 'wrong_step', label: 'Paso', kind: 'number' }, ' 2 ')).toBe(2);
    expect(slotValue(headline, ' Hola ')).toBe('Hola');
  });
});
