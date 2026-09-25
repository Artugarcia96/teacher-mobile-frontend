import { describe, expect, it } from 'vitest';
import { cells, fromText, toText } from './fieldText';

describe('edit sheet text', () => {
  it('keeps an absolute value and empty cells in their place', () => {
    expect(cells('|x| | 2')).toEqual(['|x|', '2']);
    expect(cells('a |  | c')).toEqual(['a', '', 'c']);
    expect(cells('a | b |')).toEqual(['a', 'b', '']);
    expect(cells('| b')).toEqual(['', 'b']);
    expect(cells('sin separador')).toEqual(['sin separador']);
  });

  it('gives back the same table, pairs and header after a round trip', () => {
    const rows = [['x', '|x|'], ['-3', ''], ['', '4,5']];
    expect(fromText('rows', toText('rows', rows))).toEqual(rows);
    const pairs = [['Gen', 'Fragmento de ADN'], ['Alelo', 'Cada forma de un gen']];
    expect(fromText('pairs', toText('pairs', pairs))).toEqual(pairs);
    expect(fromText('cells', toText('cells', ['Magnitud A', 'Magnitud B']))).toEqual(['Magnitud A', 'Magnitud B']);
    expect(fromText('lines', toText('lines', ['uno', 'dos']))).toEqual(['uno', 'dos']);
  });

  it('drops incomplete pairs and blank lines', () => {
    expect(fromText('pairs', 'Gen | ADN\nsolo izquierda\n\nAlelo |')).toEqual([['Gen', 'ADN']]);
    expect(fromText('rows', 'a | b\n\n  \nc | d')).toEqual([['a', 'b'], ['c', 'd']]);
    expect(fromText('cells', 'A |  | B |')).toEqual(['A', 'B']);
  });
});
