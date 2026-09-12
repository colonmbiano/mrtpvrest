const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'packages', 'database', '.env') });

const { prisma, runWithBypass } = require('../packages/database');

const PANDA_NAMES = ['Baby Panda', 'Panda', 'King Panda'];

const GROUPS = [
  {
    name: 'Preparación',
    required: true,
    multiSelect: false,
    minSelection: 1,
    maxSelection: 1,
    options: [
      { name: 'Sin hielo', priceAdd: 0 },
      { name: 'Normal', priceAdd: 0, isDefault: true },
      { name: 'Frappé', priceAdd: 0 },
    ],
  },
  {
    name: 'Base de tu creación',
    required: true,
    multiSelect: false,
    minSelection: 1,
    maxSelection: 1,
    options: [
      { name: 'Base cremosa Toki', priceAdd: 0, isDefault: true, section: 'normal' },
      { name: 'Leche deslactosada', priceAdd: 0, section: 'normal' },
      { name: 'Té verde', priceAdd: 0, section: 'normal' },
      { name: 'Té negro', priceAdd: 0, section: 'normal' },
      { name: 'Soda italiana', priceAdd: 0, section: 'normal' },
      { name: 'Leche de coco', priceAdd: 10, section: 'especial' },
      { name: 'Leche de almendras', priceAdd: 10, section: 'especial' },
      { name: 'Yogur griego', priceAdd: 10, section: 'especial' },
      { name: 'Yakult', priceAdd: 10, section: 'especial' },
    ],
  },
  {
    name: 'Sabor',
    required: true,
    multiSelect: false,
    minSelection: 1,
    maxSelection: 1,
    options: [
      { name: 'Taro', priceAdd: 0, section: 'cremoso', isDefault: true },
      { name: 'Matcha', priceAdd: 0, section: 'cremoso' },
      { name: 'Fresas con crema', priceAdd: 0, section: 'cremoso' },
      { name: 'Coco', priceAdd: 0, section: 'cremoso' },
      { name: 'Lavanda', priceAdd: 0, section: 'cremoso' },
      { name: 'Nuez de macadamia', priceAdd: 0, section: 'cremoso' },
      { name: 'Cookies and cream', priceAdd: 0, section: 'cremoso' },
      { name: 'Plátano', priceAdd: 0, section: 'cremoso' },
      { name: 'Capuchino', priceAdd: 0, section: 'cremoso' },
      { name: 'Capuchino caramel', priceAdd: 0, section: 'cremoso' },
      { name: 'Chocolate premium', priceAdd: 0, section: 'cremoso' },
      { name: 'Mora azul (Cremoso)', priceAdd: 0, section: 'cremoso' },
      { name: 'Mango (Cremoso)', priceAdd: 0, section: 'cremoso' },
      { name: 'Fresa', priceAdd: 0, section: 'frutal' },
      { name: 'Mango (Frutal)', priceAdd: 0, section: 'frutal' },
      { name: 'Durazno', priceAdd: 0, section: 'frutal' },
      { name: 'Mora azul (Frutal)', priceAdd: 0, section: 'frutal' },
      { name: 'Frutos rojos', priceAdd: 0, section: 'frutal' },
      { name: 'Kiwi', priceAdd: 0, section: 'frutal' },
      { name: 'Manzana verde', priceAdd: 0, section: 'frutal' },
      { name: 'Lichi', priceAdd: 0, section: 'frutal' },
      { name: 'Guanábana', priceAdd: 0, section: 'frutal' },
      { name: 'Arándano', priceAdd: 0, section: 'frutal' },
    ],
  },
  {
    name: 'Toque final',
    required: true,
    multiSelect: false,
    minSelection: 1,
    maxSelection: 1,
    options: [
      { name: 'Sin acompañante', priceAdd: 0, isDefault: true },
      { name: 'Tapioca negra', priceAdd: 0 },
      { name: 'Popping boba de mango', priceAdd: 0 },
      { name: 'Popping boba de maracuyá', priceAdd: 0 },
      { name: 'Popping boba de fresa', priceAdd: 0 },
      { name: 'Popping boba de lichi', priceAdd: 0 },
      { name: 'Popping boba de mora azul', priceAdd: 0 },
      { name: 'Popping boba de kiwi', priceAdd: 0 },
      { name: 'Popping boba de durazno', priceAdd: 0 },
      { name: 'Popping boba de taro', priceAdd: 0 },
      { name: 'Popping boba de manzana verde', priceAdd: 0 },
      { name: 'Popping boba de piña colada', priceAdd: 0 },
      { name: 'Popping boba de limonada rosa', priceAdd: 0 },
      { name: 'Popping boba de uva', priceAdd: 0 },
      { name: 'Popping boba de chamoy', priceAdd: 0 },
      { name: 'Jelly', priceAdd: 0 },
    ],
  },
  {
    name: 'Siguiente nivel',
    required: true,
    multiSelect: false,
    minSelection: 1,
    maxSelection: 1,
    options: [
      { name: 'Ninguno', priceAdd: 0, isDefault: true },
      { name: 'Toki Cloud', priceAdd: 15 },
      { name: 'Toki Cheese Cloud', priceAdd: 15 },
      { name: 'Extra tapioca negra', priceAdd: 15 },
      { name: 'Extra popping boba', priceAdd: 15 },
    ],
  },
];

async function ensureGroup(menuItemId, spec) {
  let group = await prisma.modifierGroup.findFirst({
    where: { menuItemId, name: spec.name },
    include: { modifiers: true },
  });

  const groupData = {
    required: spec.required,
    multiSelect: spec.multiSelect,
    minSelection: spec.minSelection,
    maxSelection: spec.maxSelection,
    freeModifiersLimit: 0,
    groupType: 'ADD',
  };

  if (!group) {
    group = await prisma.modifierGroup.create({
      data: { menuItemId, name: spec.name, ...groupData },
      include: { modifiers: true },
    });
  } else {
    group = await prisma.modifierGroup.update({
      where: { id: group.id },
      data: groupData,
      include: { modifiers: true },
    });
  }

  // Delete old modifiers that are not in the new options list
  const newNames = spec.options.map(o => o.name);
  const toDelete = group.modifiers.filter(m => !newNames.includes(m.name));
  if (toDelete.length > 0) {
    await prisma.modifier.deleteMany({
      where: { id: { in: toDelete.map(m => m.id) } },
    });
  }

  for (const option of spec.options) {
    const existing = group.modifiers.find((modifier) => modifier.name === option.name);
    const data = {
      priceAdd: option.priceAdd,
      isDefault: !!option.isDefault,
      isAvailable: true,
    };
    if (existing) {
      await prisma.modifier.update({ where: { id: existing.id }, data });
    } else {
      await prisma.modifier.create({
        data: { groupId: group.id, name: option.name, ...data },
      });
    }
  }
}

async function configure() {
  return runWithBypass(async () => {
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: 'tokki-bobba' },
      select: { id: true, name: true },
    });
    if (!restaurant) throw new Error('No se encontró el restaurante tokki-bobba.');

    const pandas = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, name: { in: PANDA_NAMES } },
      select: { id: true, name: true },
    });
    if (pandas.length !== PANDA_NAMES.length) {
      throw new Error(`Se esperaban ${PANDA_NAMES.length} Pandas y se encontraron ${pandas.length}.`);
    }

    for (const panda of pandas) {
      await prisma.menuItem.update({
        where: { id: panda.id },
        data: { description: 'Crea tu bebida ideal en 6 pasos.' },
      });
      for (const group of GROUPS) await ensureGroup(panda.id, group);
    }

    const result = await prisma.menuItem.findMany({
      where: { restaurantId: restaurant.id, name: { in: PANDA_NAMES } },
      select: {
        name: true,
        price: true,
        description: true,
        modifierGroups: {
          select: { name: true, required: true, minSelection: true, maxSelection: true, modifiers: { select: { name: true, priceAdd: true, isAvailable: true } } },
        },
      },
      orderBy: { price: 'asc' },
    });

    console.log(JSON.stringify({ restaurant: restaurant.name, products: result }, null, 2));
  });
}

configure()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
