import { describe, expect, it } from 'vitest';
import { resolveText } from './RichText';

describe('RichText substitutions', () => {
  const subs = { names: { '{nombre1}': 'Lucía', '{nombre2}': 'Marcos' } };

  it('fills the invented names', () => {
    expect(resolveText('{nombre1} ha escrito: $\\frac{1}{2}$; {nombre2} no.', subs)).toBe('Lucía ha escrito: $\\frac{1}{2}$; Marcos no.');
  });

  it('leaves what it does not know as written, and maths braces alone', () => {
    expect(resolveText('{nombre9}', subs)).toBe('{nombre9}');
    expect(resolveText('$x^{2}$ y {nombre}', {})).toBe('$x^{2}$ y {nombre}');
  });
});
