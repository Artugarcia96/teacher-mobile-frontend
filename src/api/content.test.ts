import { describe, expect, it } from 'vitest';
import { isContentDoc, isSlide, type Slide, type SlotField, type TextBlock } from './content';

const doc = {
  kind: 'presentacion', title: 'Fracciones', subtitle: '', subject: 'Matemáticas', level: '1.º ESO', unit: 'Fracciones',
  intro: '', objectives: [], instructions: '', opener: null, sections: [], slides: [], images: [], summary: [], glossary: [],
  family: 'matematicas', language: 'es', response_mode: 'cuaderno', meta: {},
  lessons: [{
    n: 1, title: 'Fracciones equivalentes', kind: 'nueva', question: '', criteria: [], minutes: 55, homework: '', contents: [],
    sections: [], status: 'ready', error: '',
  }],
};

describe('content documents', () => {
  it('reads a document with its lessons', () => {
    expect(isContentDoc(doc)).toBe(true);
  });

  it('leaves a stored document of the old shape (sessions, no lessons) read-only', () => {
    const { lessons: _lessons, ...old } = doc;
    expect(isContentDoc({ ...old, sessions: ['Sesión 1: Fracciones'] })).toBe(false);
    expect(isContentDoc(null)).toBe(false);
    expect(isContentDoc({ ...doc, kind: 'libro' })).toBe(false);
  });

  it('tells a slide from a block', () => {
    const block: TextBlock = { id: 'b1', type: 'text', text: 'Texto' };
    expect(isSlide(block)).toBe(false);
    expect(isSlide({ id: 'd1-1', archetype: 'portada' } as Slide)).toBe(true);
  });

  it('reads a choice from another slot or from a fixed set, never both', () => {
    // As GET /content/archetypes serves them (bisagra, verdadero_falso).
    const fields: SlotField[] = [
      { slot: 'answer', label: 'Respuesta correcta', kind: 'choice', from: 'options', required: true },
      { slot: 'answer', label: 'Respuesta', kind: 'choice', options: ['Verdadero', 'Falso'], required: true },
      { slot: 'items', label: 'Elementos (uno por línea)', kind: 'items', syntax: 'texto | respuesta' },
    ];
    for (const f of fields.filter((x) => x.kind === 'choice')) {
      expect(Number(f.from !== undefined) + Number(f.options !== undefined)).toBe(1);
    }
    // @ts-expect-error a choice names one source only
    const both: SlotField = { slot: 'answer', label: 'Respuesta', kind: 'choice', from: 'options', options: ['A'] };
    expect(both.kind).toBe('choice');
  });
});
