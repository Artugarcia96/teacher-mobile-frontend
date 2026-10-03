import { describe, expect, it } from 'vitest';
import type { SessionLog, SessionPresentation } from '../../api/sessions';
import { initialLesson, lessonTexts } from './CloseSessionSheet';

const p: SessionPresentation = {
  id: 'm1', title: 'Presentación · Al-Ándalus', lesson: 3, slide: 12,
  lessons: [
    { n: 3, title: 'La conquista (711-718)', homework: 'Actividades 4, 7 y 9 (p. 5)', slides: 18 },
    { n: 4, title: 'El emirato', homework: '', slides: 17 },
  ],
};
const log = (patch: Partial<SessionLog>): SessionLog => ({
  date: '2026-11-19', start: '10:20', saved: false, material_id: null, lesson: null, lesson_done: null, presentation: p, ...patch,
});

describe('«Cerrar clase» lesson row', () => {
  it('writes the lesson done, the next one and its homework', () => {
    expect(lessonTexts(p, 3, 'done', null)).toEqual({
      done: 'Sesión 3 · La conquista (711-718)', next: 'Sesión 4 · El emirato', homework: 'Actividades 4, 7 y 9 (p. 5)',
    });
    expect(lessonTexts(p, 3, 'half', 12)).toEqual({
      done: 'Sesión 3 · La conquista (711-718), hasta la diapositiva 12', next: 'Terminar la sesión 3', homework: 'Actividades 4, 7 y 9 (p. 5)',
    });
    expect(lessonTexts(p, 4, 'done', null).next).toBe('');
    const gap = { ...p, lessons: [p.lessons[0], { n: 5, title: 'El califato', homework: '', slides: 16 }] }; // 4 failed
    expect(lessonTexts(gap, 3, 'done', null).next).toBe('Sesión 5 · El califato');
    expect(lessonTexts(p, 3, 'none', 12)).toEqual({ done: '', next: '', homework: '' });
  });

  it('starts from what was saved, else from where the presenter got to', () => {
    expect(initialLesson(log({}))).toEqual({ lesson: 3, state: 'half' });
    expect(initialLesson(log({ presentation: { ...p, slide: 18 } }))).toEqual({ lesson: 3, state: 'done' });
    expect(initialLesson(log({ presentation: { ...p, slide: null } }))).toEqual({ lesson: 3, state: 'done' });
    expect(initialLesson(log({ saved: true, material_id: 'm1', lesson: 4, lesson_done: false }))).toEqual({ lesson: 4, state: 'half' });
    expect(initialLesson(log({ saved: true }))).toEqual({ lesson: 3, state: 'none' });
    expect(initialLesson(log({ saved: true, material_id: 'm2', lesson: 4, lesson_done: true }))).toEqual({ lesson: 3, state: 'none' });
    expect(initialLesson(log({ saved: true, material_id: 'm1', lesson: 2, lesson_done: true }))).toEqual({ lesson: 3, state: 'none' });
  });
});
