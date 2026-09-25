import { describe, expect, it } from 'vitest';
import type { Unit } from '../../api/units';
import type { StudentRef } from '../../api/types';
import { unitFor } from '../units/unitFor';
import { missingNames } from './MissingPapers';

const st = (first_name: string, last_name: string): StudentRef => ({
  id: `${first_name}-${last_name}`, first_name, last_name, name: `${first_name} ${last_name}`, sort_name: `${last_name}, ${first_name}`, initials: '',
});

describe('missingNames', () => {
  const everyone = [st('Ana', 'Pérez Gil'), st('Luis', 'Ruiz Sanz'), st('Rubén', 'Cortés Domínguez'), st('Rubén', 'Fernández Rodríguez')];
  it('lists first names, like the rest of the row', () => {
    expect(missingNames([everyone[0], everyone[1]], everyone)).toBe('Ana y Luis');
    expect(missingNames([everyone[1]], everyone)).toBe('Luis');
  });
  it('adds the initial of the surname when two students share a first name', () => {
    expect(missingNames([everyone[3], everyone[0]], everyone)).toBe('Rubén F. y Ana');
  });
  it('cuts a long list', () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => st(x, 'Z'));
    expect(missingNames(many, many)).toBe('A, B, C y 3 más');
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
