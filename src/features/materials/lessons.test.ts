import { describe, expect, it } from 'vitest';
import { lessonsCount } from './lessons';

describe('lessons', () => {
  it('counts a presentation\'s lessons for the unit row', () => {
    expect(lessonsCount({ lessons_total: 5, lessons_ready: 5 })).toBe('5 sesiones');
    expect(lessonsCount({ lessons_total: 5, lessons_ready: 2 })).toBe('2 de 5 sesiones listas');
    expect(lessonsCount({ lessons_total: 1, lessons_ready: 1 })).toBe('1 sesión');
    expect(lessonsCount({ lessons_total: 0, lessons_ready: 0 })).toBe('');
  });
});
