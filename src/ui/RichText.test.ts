import { describe, expect, it } from 'vitest';
import { resolveText } from './RichText';

describe('RichText substitutions', () => {
  const subs = { refs: { 'mapa-expansion': 'fig. 3', 'tabla-1': 'tabla 1' }, names: { '{nombre1}': 'Lucía', '{nombre2}': 'Marcos' } };

  it('reads [[ref]] as the number the PDF prints', () => {
    expect(resolveText('Mira la [[mapa-expansion]] y la [[tabla-1]].', subs)).toBe('Mira la fig. 3 y la tabla 1.');
    expect(resolveText('Mira la [[ mapa-expansion ]].', subs)).toBe('Mira la fig. 3.');
  });

  it('fills the invented names', () => {
    expect(resolveText('{nombre1} ha escrito: $\\frac{1}{2}$; {nombre2} no.', subs)).toBe('Lucía ha escrito: $\\frac{1}{2}$; Marcos no.');
  });

  it('leaves what it does not know as written, and maths braces alone', () => {
    expect(resolveText('[[otra]] y {nombre9}', subs)).toBe('[[otra]] y {nombre9}');
    expect(resolveText('$x^{2}$ y {nombre}', {})).toBe('$x^{2}$ y {nombre}');
  });
});
