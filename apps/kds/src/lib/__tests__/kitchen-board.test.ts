import { boardColumns, boardRange } from '../kitchen-board';

test('la tablet permite 3 tickets normales, 4 compactos y 2 grandes', () => {
  expect(boardColumns(937, 'normal')).toBe(3);
  expect(boardColumns(937, 'compact')).toBe(4);
  expect(boardColumns(937, 'large')).toBe(2);
  expect(boardColumns(570, 'normal')).toBe(2);
  expect(boardColumns(320, 'normal')).toBe(1);
});
test('recorre todos los pedidos, incluida la última página incompleta', () => {
  const ids = Array.from({ length: 11 }, (_, index) => String(index));
  const visited: string[] = [];
  for (let index = 0; index < ids.length; index += 3) {
    const range = boardRange(ids, { id: ids[index]!, index }, 3);
    visited.push(...ids.slice(range.start, range.end));
  }
  expect(visited).toEqual(ids);
});
test('conserva el pedido visible cuando cambia la cola y limita un ancla retirada', () => {
  expect(boardRange(['new', 'a', 'b', 'c', 'd', 'e'], { id: 'c', index: 2 }, 3)).toEqual({ start: 3, end: 6 });
  expect(boardRange(['a', 'b'], { id: 'gone', index: 9 }, 3)).toEqual({ start: 1, end: 2 });
  expect(boardRange([], { id: 'gone', index: 9 }, 3)).toEqual({ start: 0, end: 0 });
});
