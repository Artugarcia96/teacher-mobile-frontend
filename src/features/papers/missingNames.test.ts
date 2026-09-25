import { describe, expect, it } from 'vitest';
import type { Unit } from '../../api/units';
import type { StudentRef } from '../../api/types';
import { unitFor } from '../units/unitFor';
import { missingNames } from './MissingPapers';

const st = (first_name: string, last_name: string): StudentRef => ({
  id: `${first_name}-${last_name}`, first_name, last_name, name: `${first_name} ${last_name}`, sort_name: `${last_name}, ${first_name}`, initials: '',
});

describe('missingNames', () => {
  const everyone = [st('Ana', 'Pérez Gil'), st('Luis', 'Ruiz Sanz'), st('Nerea', 'Cortés Domínguez'), st('Carmen', 'Cortés Rodríguez')];
  it('lists first surnames with commas (never "y": it reads as a double surname)', () => {
    expect(missingNames([everyone[0], everyone[1]], everyone)).toBe('Pérez, Ruiz');
  });
  it('adds the first name when two students share the surname', () => {
    expect(missingNames([everyone[3], everyone[0]], everyone)).toBe('Carmen Cortés, Pérez');
  });
  it('cuts a long list', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => st('X', `${x}z`));
    expect(missingNames(many, many)).toBe('Az, Bz, Cz y 3 más');
  });
});

describe('unitFor', () => {
  const u = (id: string, title: string, status: Unit['status'] = 'pending'): Unit =>
    ({ id, course_id: 'c', title, term: 1, position: 0, status, material_count: 0 });
  const units = [u('1', 'Fracciones', 'current'), u('2', 'Potencias y raíces'), u('3', 'Números enteros')];
  it('prefers the linked unit, then the one the title names, then the current one', () => {
    expect(unitFor(units, 'Examen U3 · Potencias y raíces', ['3'])).toBe('3');
    expect(unitFor(units, 'Examen U3 · Potencias y raices')).toBe('2');
    expect(unitFor(units, 'Control del martes')).toBe('1');
  });
});
