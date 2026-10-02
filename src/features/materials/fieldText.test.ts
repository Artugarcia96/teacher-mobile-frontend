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

describe('slide lists in the line syntax', () => {
  const item = (text: string, answer = '', more: object = {}) => ({ text, answer, term: '', level: 0, prose: false, ...more });

  it('reads «texto | respuesta», «término | texto» and «nivel | texto | respuesta»', () => {
    expect(fromText('items', '¿Cuánto es 1/2 + 1/4? | 3/4\nSin respuesta')).toEqual([item('¿Cuánto es 1/2 + 1/4?', '3/4'), item('Sin respuesta')]);
    expect(fromText('terms', 'Numerador | lo que se toma\nsolo texto')).toEqual([item('lo que se toma', '', { term: 'Numerador' }), item('solo texto')]);
    expect(fromText('practice', '2 | Simplifica 6/8 | 3/4\nSuma 1/3 y 1/6 | 1/2')).toEqual([
      item('Simplifica 6/8', '3/4', { level: 2 }), item('Suma 1/3 y 1/6', '1/2', { level: 1 }),
    ]);
  });

  it('keeps what the text does not show with the element in the same place', () => {
    const prev = [item('a', 'x', { prose: true, level: 3 }), item('b')];
    expect(fromText('practice', '3 | a cambiada | x\n1 | b', prev)).toEqual([
      item('a cambiada', 'x', { prose: true, level: 3 }), item('b', '', { level: 1 }),
    ]);
    const steps = [{ show: '$6/8$', say: 'divide entre 2', phase: 'Resolución' }];
    expect(fromText('steps', '$6/8 = 3/4$ | divide entre 2', steps)).toEqual([{ show: '$6/8 = 3/4$', say: 'divide entre 2', phase: 'Resolución' }]);
    expect(fromText('column', 'Agua\nlíquida\nincolora', { heading: 'x', cells: [], image_id: 'img2' }))
      .toEqual({ heading: 'Agua', cells: ['líquida', 'incolora'], image_id: 'img2' });
  });

  it('gives back the same lists after a round trip', () => {
    const items = [item('Calcula |x| si x = -3', '3'), item('Sin respuesta')];
    expect(fromText('items', toText('items', items), items)).toEqual(items);
    const steps = [{ show: '', say: 'Se busca el denominador común', phase: '' }, { show: '$1/2 = 2/4$', say: '', phase: '' }];
    expect(fromText('steps', toText('steps', steps), steps)).toEqual(steps);
    expect(toText('practice', [item('Simplifica', '1/2', { level: 2 })])).toBe('2 | Simplifica | 1/2');
  });
});
