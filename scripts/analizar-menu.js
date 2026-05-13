const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const csvPath = 'receipts-by-item-2026-05-08-2026-05-08.csv';
  const csv = fs.readFileSync(csvPath, 'utf-8');
  
  const splitLine = (l) => {
    const r = []; let c = '', q = false;
    for (const char of l) {
      if (char === '"') q = !q;
      else if (char === ',' && !q) { r.push(c); c = ''; }
      else c += char;
    }
    r.push(c); return r;
  };

  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  const headers = splitLine(lines[0]);
  const rows = lines.slice(1).map(l => {
    const v = splitLine(l);
    const o = {};
    headers.forEach((h, i) => o[h.trim()] = v[i] ? v[i].trim() : '');
    return o;
  });

  const csvItems = new Set();
  rows.forEach(r => {
    const full = `${r['Artículo']} ${r['Variante']}`.trim();
    csvItems.add(full);
  });

  const dbItems = await prisma.menuItem.findMany({
    where: { restaurantId: 'cmop06al30005snbd74adrqu4' },
    select: { name: true }
  });
  
  const dbItemNames = new Set(dbItems.map(i => i.name.toLowerCase().trim()));
  
  const missing = [];
  const found = [];
  
  csvItems.forEach(item => {
    if (!dbItemNames.has(item.toLowerCase())) {
      // Intentar solo por artículo si no hay variante
      const articleOnly = item.split(' ')[0].toLowerCase();
      if (!dbItemNames.has(articleOnly)) {
        missing.push(item);
      } else {
        found.push(item);
      }
    } else {
      found.push(item);
    }
  });

  console.log('\n--- PRODUCTOS FALTANTES EN EL MENÚ ---');
  missing.forEach(m => console.log(`❌ ${m}`));
  
  console.log('\n--- SUGERENCIAS DE CATEGORÍAS ---');
  const categories = [...new Set(rows.map(r => r['Categoria']))];
  console.log(categories.join(', '));

  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
