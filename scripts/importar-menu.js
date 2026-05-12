const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } // Escaped quotes
      else inQ = !inQ;
    }
    else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-16le').includes('\ufeff') 
    ? fs.readFileSync(filePath, 'utf-16le') 
    : fs.readFileSync(filePath, 'utf-8');
    
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ''));
  
  return lines.slice(1).map((l) => {
    const vals = splitCsvLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return row;
  });
}

async function upsertCategory(restaurantId, name) {
  if (!name) return null;
  const existing = await prisma.category.findFirst({ where: { restaurantId, name } });
  if (existing) return existing;
  return prisma.category.create({ data: { restaurantId, name, isActive: true } });
}

async function ensureModifierGroup(restaurantId, menuItemId, name) {
  const existing = await prisma.modifierGroup.findFirst({
    where: { menuItemId, name }
  });
  if (existing) return existing;
  return prisma.modifierGroup.create({
    data: { menuItemId, name, required: false, multiSelect: true }
  });
}

async function run() {
  const [, , restaurantId, csvPath] = process.argv;
  if (!restaurantId || !csvPath) {
    console.error('Uso: node scripts/importar-menu.js <restaurantId> <csvPath>');
    process.exit(1);
  }

  const rows = parseCsv(path.resolve(csvPath));
  const modifierColumns = Object.keys(rows[0]).filter(k => k.startsWith('modificador - '));

  // Agrupar por 'Handle' (es el ID único del producto en Loyverse)
  const groups = new Map();
  rows.forEach(row => {
    const handle = row['Handle'];
    if (!handle) return;
    if (!groups.has(handle)) groups.set(handle, []);
    groups.get(handle).push(row);
  });

  console.log(`📥 Procesando ${groups.size} grupos de productos...`);

  for (const [handle, items] of groups) {
    const main = items.find(i => i['Nombre']) || items[0];
    const name = main['Nombre'];
    const categoryName = main['Categoria'];
    
    const category = await upsertCategory(restaurantId, categoryName);
    if (!category) continue;

    const hasVariants = items.length > 1 || items[0]['Opción 1 valor'];
    const basePrice = parseFloat(main['Precio [Master burger]']) || parseFloat(main['Precio por defecto']) || 0;

    // Upsert MenuItem
    let menuItem = await prisma.menuItem.findFirst({
      where: { restaurantId, name }
    });

    const itemData = {
      restaurantId,
      categoryId: category.id,
      name,
      price: basePrice,
      hasVariants: !!hasVariants,
      description: main['Descripción'] || null,
      isAvailable: true
    };

    if (menuItem) {
      menuItem = await prisma.menuItem.update({ where: { id: menuItem.id }, data: itemData });
    } else {
      menuItem = await prisma.menuItem.create({ data: itemData });
    }

    // Procesar Variantes
    if (hasVariants) {
      for (const item of items) {
        const variantName = [item['Opción 1 valor'], item['Opción 2 valor'], item['Opción 3 valor']]
          .filter(Boolean).join(' ').trim();
        if (!variantName) continue;

        const vPrice = parseFloat(item['Precio [Master burger]']) || parseFloat(item['Precio por defecto']) || 0;
        
        const existingVariant = await prisma.menuItemVariant.findFirst({
          where: { menuItemId: menuItem.id, name: variantName }
        });

        if (existingVariant) {
          await prisma.menuItemVariant.update({
            where: { id: existingVariant.id },
            data: { price: vPrice, isAvailable: true }
          });
        } else {
          await prisma.menuItemVariant.create({
            data: { menuItemId: menuItem.id, name: variantName, price: vPrice, isAvailable: true }
          });
        }
      }
    }

    // Procesar Modificadores
    for (const col of modifierColumns) {
      if (main[col] === 'Y') {
        const groupName = col.replace('modificador - ', '').replace(/"/g, '');
        await ensureModifierGroup(restaurantId, menuItem.id, groupName);
      }
    }

    process.stdout.write('.');
  }

  console.log('\n✅ Importación completada.');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
