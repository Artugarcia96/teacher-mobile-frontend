import { describe, expect, it } from 'vitest';
import type { StudentFile } from '../../api/types';
import { studentSummary } from './summary';

const course = { id: 'c1', subject: 'Matemáticas', short: 'Mates', color: 'teal', group: { id: 'g', name: '2º ESO B', stage: 'eso' as const }, label: 'Matemáticas · 2º ESO B' };

describe('studentSummary', () => {
  it('is fixed text with the file numbers', () => {
    const f: StudentFile = {
      student: { id: 's', first_name: 'Hugo', last_name: 'Domínguez Marín', name: 'Hugo Domínguez Marín', sort_name: '', initials: 'HD' },
      groups: [], watch: [],
      courses: [{
        course, grades: [], absences: 7, justified: 2, lates: 1,
        terms: [{ term: 1, average: 5.29, final: null }, { term: 2, average: null, final: null }],
        pending_exams: [{ activity_id: 'a', title: 'Examen U2', date: '2026-11-17', status: 'absent' }],
      }],
      notes: [
        { id: 'n1', date: '2026-11-18', kind: 'incident', text: 'No trae el\nmaterial.', students: [], created_at: '', updated_at: '' },
        { id: 'n2', date: '2026-11-10', kind: 'positive', text: 'Ayuda a un compañero.', students: [], created_at: '', updated_at: '' },
      ],
    };
    expect(studentSummary(f, 1)).toBe([
      'Hugo Domínguez Marín',
      'Matemáticas · 2.º ESO B: media 5,3 en la 1.ª evaluación · 9 faltas (2 justificadas) · 1 retraso · pendiente: Examen U2 (NP)',
      'Últimas observaciones:',
      '· 18 nov, incidencia: No trae el material.',
      '· 10 nov, positivo: Ayuda a un compañero.',
    ].join('\n'));
  });
});
