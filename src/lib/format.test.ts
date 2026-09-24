import { describe, expect, it } from 'vitest';
import { courseShortLabel, formatAverage, formatProposal, formatScore, gradeTone, ordinals, sessionText } from './format';

describe('grade rules', () => {
  it('averages one decimal, scores up to two, proposals integer', () => {
    expect(formatAverage(6.875)).toBe('6,9');
    expect(formatAverage(7)).toBe('7');
    expect(formatScore(6.25)).toBe('6,25');
    expect(formatScore(4.75)).toBe('4,75');
    expect(formatProposal(6.5)).toBe('7');
    expect(formatAverage(null)).toBe('—');
  });
  it('three tones', () => {
    expect([4.99, 5, 8.9, 9, null].map(gradeTone)).toEqual(['fail', 'pass', 'pass', 'great', 'none']);
  });
});

describe('ordinals', () => {
  it('normalizes group names and terms', () => {
    expect(ordinals('2º ESO B')).toBe('2.º ESO B');
    expect(ordinals('2° ESO B')).toBe('2.º ESO B');
    expect(ordinals('1ªevaluación')).toBe('1.ª evaluación');
    expect(ordinals('2.º ESO B')).toBe('2.º ESO B');
    expect(courseShortLabel({ subject: 'Matemáticas', short: 'Mates', group: { name: '1º Bach B' } })).toBe('1.º Bach B · Mates');
  });
});

describe('sessionText', () => {
  const s = (date: string, start: string, end: string) => ({ date, start, end });
  it('live, today, tomorrow, later', () => {
    expect(sessionText(s('2026-11-19', '10:20', '11:15'), '2026-11-19', '10:40')).toBe('En clase hasta 11:15');
    expect(sessionText(s('2026-11-19', '12:40', '13:35'), '2026-11-19', '10:40')).toBe('Hoy 12:40');
    expect(sessionText(s('2026-11-20', '11:45', '12:40'), '2026-11-19', '10:40')).toBe('Mañana 11:45');
    expect(sessionText(s('2026-11-24', '08:30', '09:25'), '2026-11-19', '10:40')).toBe('Martes 24 nov, 08:30');
    expect(sessionText(null, '2026-11-19')).toBeNull();
  });
});
