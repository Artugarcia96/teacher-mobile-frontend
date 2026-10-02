import { describe, expect, it } from 'vitest';
import { isContentDoc, isSlide, type Slide, type TextBlock } from './content';

const doc = {
  kind: 'presentacion', title: 'Fracciones', subtitle: '', subject: 'Matemáticas', level: '1.º ESO', unit: 'Fracciones',
  intro: '', objectives: [], instructions: '', opener: null, sections: [], slides: [], images: [], summary: [], glossary: [],
  family: 'matematicas', language: 'es', meta: {},
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
});
