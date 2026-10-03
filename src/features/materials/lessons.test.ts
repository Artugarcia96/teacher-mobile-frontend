import { describe, expect, it } from 'vitest';
import { familyOf, lessonsCount, slotMinutes, stageOf } from './lessons';

describe('lessons', () => {
  it('counts a presentation\'s lessons for the unit row', () => {
    expect(lessonsCount({ lessons_total: 5, lessons_ready: 5 })).toBe('5 sesiones');
    expect(lessonsCount({ lessons_total: 5, lessons_ready: 2 })).toBe('2 de 5 sesiones listas');
    expect(lessonsCount({ lessons_total: 1, lessons_ready: 1 })).toBe('1 sesión');
    expect(lessonsCount({ lessons_total: 0, lessons_ready: 0 })).toBe('');
  });

  it('names the family and stage as the server does', () => {
    expect(familyOf('Matemáticas I')).toBe('matematicas');
    expect(familyOf('Física y Química')).toBe('fisica_quimica');
    expect(familyOf('Geografía e Historia')).toBe('sociales');
    expect(familyOf('Lengua Castellana y Literatura')).toBe('lengua');
    expect(familyOf('Inglés')).toBe('idioma');
    expect(familyOf('Música')).toBe('otra');
    expect(stageOf('1º Bach B')).toBe('bachillerato');
    expect(stageOf('2º ESO B')).toBe('eso');
    expect(stageOf('6º Primaria')).toBe('primaria');
  });

  it('takes the class length from its most frequent slot', () => {
    expect(slotMinutes([])).toBe(55);
    expect(slotMinutes([{ start: '08:30', end: '09:25' }, { start: '10:20', end: '11:15' }, { start: '12:00', end: '12:50' }])).toBe(55);
    expect(slotMinutes([{ start: '08:00', end: '08:50' }, { start: '09:00', end: '09:50' }])).toBe(50);
  });
});
