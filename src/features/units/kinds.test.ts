import { describe, expect, it } from 'vitest';
import { failedText, readyText, shortTitle } from './kinds';

describe('material names', () => {
  it('leaves out the unit the page already shows', () => {
    expect(shortTitle('Apuntes · El átomo', 'El átomo')).toBe('Apuntes');
    expect(shortTitle('Ficha de refuerzo · El átomo (2)', 'El átomo')).toBe('Ficha de refuerzo (2)');
    expect(shortTitle('Mis apuntes de repaso', 'El átomo')).toBe('Mis apuntes de repaso');
    expect(shortTitle('Apuntes · El átomo', null)).toBe('Apuntes · El átomo');
  });

  it('says when it is ready or failed, with the right agreement', () => {
    expect(readyText({ kind: 'notes', options: {} }, 'El átomo')).toBe('Apuntes de «El átomo» listos');
    expect(readyText({ kind: 'worksheet', options: { level: 'refuerzo' } }, 'El átomo')).toBe('Ficha de refuerzo de «El átomo» lista');
    expect(failedText({ kind: 'notes', options: {} }, 'El átomo')).toBe('No se han podido crear los apuntes de «El átomo»');
    expect(failedText({ kind: 'summary', options: {} }, 'El átomo')).toBe('No se ha podido crear el resumen de «El átomo»');
  });
});
