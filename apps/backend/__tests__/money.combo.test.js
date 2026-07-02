'use strict';

// Tests de resolveComboSelection (combos configurables, B Fase 2). Cubre el
// hueco de cobertura que dejó el gate "CI — Backend Test" en rojo: la función
// entró a money.js sin test unitario.

const { resolveComboSelection } = require('../src/lib/money');

const COMBO = {
  isCombo: true,
  comboComponents: [
    {
      id: 'c_main',
      name: 'Principal',
      isRequired: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'o_burger', optionMenuItemId: 'mi_burger', priceDelta: 0, optionMenuItem: { name: 'Burger' } },
        { id: 'o_arrachera', optionMenuItemId: 'mi_arr', priceDelta: 25, optionMenuItem: { name: 'Arrachera' } },
        { id: 'o_off', optionMenuItemId: 'mi_off', priceDelta: 0, isAvailable: false, optionMenuItem: { name: 'Agotada' } },
      ],
    },
    {
      id: 'c_drink',
      name: 'Bebida',
      isRequired: false,
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'o_agua', optionMenuItemId: 'mi_agua', priceDelta: 0, optionMenuItem: { name: 'Agua' } },
        { id: 'o_frappe', optionMenuItemId: 'mi_frappe', priceDelta: 15, optionMenuItem: { name: 'Frappe' } },
      ],
    },
  ],
};

describe('money :: resolveComboSelection', () => {
  test('producto que no es combo devuelve delta 0 sin selecciones', () => {
    expect(resolveComboSelection({ isCombo: false }, {})).toEqual({ priceDelta: 0, selections: [] });
    expect(resolveComboSelection(null, {})).toEqual({ priceDelta: 0, selections: [] });
  });

  test('suma los priceDelta de DB y arma el snapshot con nombre "Slot: Opción"', () => {
    const r = resolveComboSelection(COMBO, {
      comboSelections: [
        { componentId: 'c_main', optionId: 'o_arrachera' },
        { componentId: 'c_drink', optionId: 'o_frappe' },
      ],
    });
    expect(r.priceDelta).toBe(40); // 25 + 15
    expect(r.selections).toHaveLength(2);
    expect(r.selections[0]).toEqual({
      componentId: 'c_main',
      optionId: 'o_arrachera',
      optionMenuItemId: 'mi_arr',
      name: 'Principal: Arrachera',
      priceDelta: 25,
    });
  });

  test('el priceDelta SIEMPRE sale de DB (ignora el del cliente)', () => {
    const r = resolveComboSelection(COMBO, {
      comboSelections: [{ componentId: 'c_main', optionId: 'o_arrachera', priceDelta: -999 }],
    });
    expect(r.priceDelta).toBe(25);
  });

  test('componente requerido sin selección lanza error', () => {
    expect(() => resolveComboSelection(COMBO, { comboSelections: [] }))
      .toThrow(/Elige una opción para "Principal"/);
  });

  test('exceder maxSelect lanza error', () => {
    expect(() => resolveComboSelection(COMBO, {
      comboSelections: [
        { componentId: 'c_main', optionId: 'o_burger' },
        { componentId: 'c_main', optionId: 'o_arrachera' },
      ],
    })).toThrow(/Máximo 1 en "Principal"/);
  });

  test('opción inexistente o no disponible lanza error', () => {
    expect(() => resolveComboSelection(COMBO, {
      comboSelections: [{ componentId: 'c_main', optionId: 'o_fantasma' }],
    })).toThrow(/Opción no disponible en "Principal"/);
    expect(() => resolveComboSelection(COMBO, {
      comboSelections: [{ componentId: 'c_main', optionId: 'o_off' }],
    })).toThrow(/Opción no disponible en "Principal"/);
  });

  test('selecciones malformadas se ignoran (y truena el required si queda vacío)', () => {
    expect(() => resolveComboSelection(COMBO, {
      comboSelections: [null, {}, { componentId: 'c_main' }, { optionId: 'o_burger' }],
    })).toThrow(/Elige una opción/);
  });

  test('comboSelections no-array se trata como vacío', () => {
    expect(() => resolveComboSelection(COMBO, { comboSelections: 'nope' }))
      .toThrow(/Elige una opción/);
  });
});
