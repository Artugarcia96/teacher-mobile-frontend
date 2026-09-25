import { describe, expect, it } from 'vitest';
import { courseShortLabel, formatAverage, formatProposal, formatScore, gradeTone, ordinals, roomLabel, sessionText } from './format';

describe('grade rules', () => {
  it('averages always one decimal, scores up to two, proposals integer', () => {
    expect(formatAverage(6.875)).toBe('6,9');
    expect(formatAverage(7)).toBe('7,0');
    expect(formatScore(6.25)).toBe('6,25');
    expect(formatScore(4.75)).toBe('4,75');
    expect(formatProposal(6.5)).toBe('7');
    expect(formatAverage(null)).toBe('—');
  });
  it('rounds half up on the decimal value, same table as the backend (tests/test_courses.py TestTextRules)', () => {
    const table: [number, string][] = [[4.25, '4,3'], [4.35, '4,4'], [6.875, '6,9'], [7, '7,0'], [6.95, '7,0'], [0.05, '0,1'], [5.29, '5,3'], [10, '10,0'], [0, '0,0']];
    for (const [v, text] of table) expect(formatAverage(v)).toBe(text);
    expect(formatScore(1.005)).toBe('1,01');
    expect(formatScore(8.125)).toBe('8,13');
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
  it('names rooms without doubling the word', () => {
    expect(roomLabel('204')).toBe('Aula 204');
    expect(roomLabel('Lab. Biología')).toBe('Lab. Biología');
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
