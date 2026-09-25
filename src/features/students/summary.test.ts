import { describe, expect, it } from 'vitest';
import { homeworkText } from './summary';

describe('homeworkText', () => {
  it('reads the right way round', () => {
    expect(homeworkText(null)).toBeNull();
    expect(homeworkText({ checks: 6, not_done: 0, partial: 0 })).toBe('Deberes: todos hechos (6)');
    expect(homeworkText({ checks: 3, not_done: 0, partial: 1 })).toBe('Deberes: todos hechos (3) · 1 incompleto');
    expect(homeworkText({ checks: 10, not_done: 4, partial: 2 })).toBe('Deberes: no hizo 4 de 10 · 2 incompletos');
  });
});
