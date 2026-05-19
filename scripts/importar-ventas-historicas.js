/**
 * importar-ventas-historicas.js
 *
 * Carga el reporte "item-sales-summary" del sistema origen (datos agregados por
 * producto entre 2 fechas) como órdenes sintéticas distribuidas en el
 * tiempo, para que el panel admin se vea poblado con datos reales.
 *
 * Estrategia:
 * 1. Fuzzy match CSV → MenuItem por restaurante.
 * 2. Cada producto vendido N veces → reparte N unidades en N órdenes
 *    distintas con createdAt random entre [startDate, endDate].
 * 3. Las órdenes agrupan 1-5 items (clustering aleatorio por timestamp).
 * 4. Status COMPLETED, paymentStatus PAID, source='HISTORICAL_IMPORT'
 *    para que sean fáciles de borrar después.
 *
 * Uso:
 *   # Dry-run (no toca DB, solo reporta matching y conteos)
 *   node scripts/importar-ventas-historicas.js <restaurantId> <csvPath> --dry-run
 *
 *   # Ejecución real
 *   node scripts/importar-ventas-historicas.js <restaurantId> <csvPath>
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/backend/.env') });
const fs = require('fs');
const path = require('path');
const { prisma } = require(path.resolve(__dirname, '../packages/database'));

// ── CSV parsing ──────────────────────────────────────────────────────────
function splitCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((l) => {
    const vals = splitCsvLine(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim().replace(/^"|"$/g, ''); });
    return row;
  });
}

function num(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ── Fuzzy match ──────────────────────────────────────────────────────────
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

// Stop-words irrelevantes: precios en paréntesis (10 / 20), conjunciones,
// abreviaturas que aparecen como ruido en el CSV del sistema origen.
const STOPWORDS = new Set(['de', 'la', 'el', 'con', 'y', 'sin', 'kg', 'gr', 'ml', 'pza', 'pzas', 'incl', 'inc']);
function tokens(s) {
  return normalize(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

// Similitud por intersección de tokens. Regla estricta para evitar falsos
// positivos como "Taco tripa" → "Crepa": requiere ≥1 token EXACTO de
// longitud ≥3. Los typos se toleran (lev ≤ 1) solo como bonus secundario.
function similarity(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokens(a), tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const setA = new Set(ta);
  const setB = new Set(tb);

  let exact = 0, fuzzy = 0;
  for (const t of setA) {
    if (setB.has(t)) { exact++; continue; }
    // Fuzzy: token de la misma longitud aprox con lev distance ≤ 1
    for (const u of setB) {
      if (Math.abs(t.length - u.length) <= 1 && levenshtein(t, u) <= 1) {
        fuzzy++; break;
      }
    }
  }

  // Hard requirement: al menos 1 token EXACTO de ≥3 chars debe coincidir.
  // Esto descarta "Taco tripa" → "Crepa" (sin exact) o "nachos"/"tacos"
  // (lev=2, no exact).
  const hasSignificantExact = [...setA].some(
    (t) => t.length >= 3 && setB.has(t),
  );
  if (!hasSignificantExact) return 0;

  // Score = (exactos + 0.5 · fuzzy) / max(|ta|, |tb|)
  // Penaliza nombres con tokens "extra" no encontrados en ambos lados.
  return (exact + 0.5 * fuzzy) / Math.max(ta.length, tb.length);
}

function bestMatch(csvName, menuItems, threshold = 0.6) {
  let best = null, bestScore = 0;
  for (const item of menuItems) {
    const score = similarity(csvName, item.name);
    if (score > bestScore) { bestScore = score; best = item; }
    if (bestScore === 1) break;
  }
  if (bestScore >= threshold) return { item: best, score: bestScore };
  return null;
}

// ── Date / random helpers ────────────────────────────────────────────────
function randomBetween(min, max) {
  return min + Math.floor(Math.random() * (max - min));
}

function randomDateBetween(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

const PAYMENT_DISTRIBUTION = [
  { method: 'CASH', weight: 60 },
  { method: 'CARD', weight: 35 },
  { method: 'TRANSFER', weight: 5 },
];
function pickPaymentMethod() {
  const total = PAYMENT_DISTRIBUTION.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PAYMENT_DISTRIBUTION) {
    r -= p.weight;
    if (r <= 0) return p.method;
  }
  return 'CASH';
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [restaurantId, csvPath] = args.filter((a) => !a.startsWith('--'));

  if (!restaurantId || !csvPath) {
    console.error('Uso: node scripts/importar-ventas-historicas.js <restaurantId> <csvPath> [--dry-run]');
    process.exit(1);
  }

  console.log(`📂 Leyendo CSV: ${csvPath}`);
  const rows = parseCsv(path.resolve(csvPath));
  console.log(`   ${rows.length} filas de productos en el CSV.`);

  console.log(`🔎 Cargando catálogo del restaurante ${restaurantId}...`);
  const menuItems = await prisma.menuItem.findMany({
    where: { restaurantId },
    select: { id: true, name: true, price: true },
  });
  console.log(`   ${menuItems.length} productos en DB.`);
  if (menuItems.length === 0) {
    console.error('❌ El restaurante no tiene productos. Aborto.');
    process.exit(1);
  }

  // ── Matching ───────────────────────────────────────────────────────────
  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const csvName = row['Artículo'] || row['Articulo'];
    const sold = Math.round(num(row['Articulos vendidos']));
    if (!csvName || sold <= 0) continue;
    const match = bestMatch(csvName, menuItems);
    if (match) {
      matched.push({ csvName, item: match.item, score: match.score, sold, row });
    } else {
      unmatched.push({ csvName, sold, row });
    }
  }

  console.log(`\n✅ Matched: ${matched.length}`);
  console.log(`❌ Sin match: ${unmatched.length}`);
  const matchedUnits = matched.reduce((s, m) => s + m.sold, 0);
  const unmatchedUnits = unmatched.reduce((s, m) => s + m.sold, 0);
  const matchedRev = matched.reduce((s, m) => s + num(m.row['Ventas netas']), 0);
  const unmatchedRev = unmatched.reduce((s, m) => s + num(m.row['Ventas netas']), 0);
  console.log(`📊 Matched:   ${matchedUnits.toLocaleString()} uds · $${matchedRev.toLocaleString()}`);
  console.log(`📊 Fallback:  ${unmatchedUnits.toLocaleString()} uds · $${unmatchedRev.toLocaleString()} → "Venta Histórica"`);
  console.log(`📊 TOTAL:     ${(matchedUnits + unmatchedUnits).toLocaleString()} uds · $${(matchedRev + unmatchedRev).toLocaleString()}`);

  // Sample matches
  console.log('\n--- Top 10 matches (por unidades) ---');
  matched.sort((a, b) => b.sold - a.sold).slice(0, 10).forEach((m) => {
    console.log(`  ${m.sold.toString().padStart(5)} × "${m.csvName}" → "${m.item.name}" (sim ${(m.score * 100).toFixed(0)}%)`);
  });
  if (unmatched.length > 0) {
    console.log('\n--- 10 sin match (mayor venta) ---');
    unmatched.sort((a, b) => b.sold - a.sold).slice(0, 10).forEach((u) => {
      console.log(`  ${u.sold.toString().padStart(5)} × "${u.csvName}"`);
    });
  }

  if (dryRun) {
    console.log('\n🟡 DRY-RUN: No se tocó la DB. Re-ejecuta sin --dry-run para importar.');
    await prisma.$disconnect();
    return;
  }

  // ── Fallback product: "Venta Histórica" ────────────────────────────────
  // Captura todos los productos del CSV que no matchearon con la DB
  // actual. Conserva el nombre original en el OrderItem.name para que en
  // reportes/tickets se vea qué se vendió.
  console.log('\n📦 Asegurando producto genérico "Venta Histórica"...');
  let fallbackCategory = await prisma.category.findFirst({
    where: { restaurantId, name: 'Histórico' },
  });
  if (!fallbackCategory) {
    fallbackCategory = await prisma.category.create({
      data: { restaurantId, name: 'Histórico', isActive: false, sortOrder: 999 },
    });
    console.log(`   Categoría "Histórico" creada (oculta, sortOrder=999).`);
  }
  let fallbackProduct = await prisma.menuItem.findFirst({
    where: { restaurantId, name: 'Venta Histórica' },
  });
  if (!fallbackProduct) {
    fallbackProduct = await prisma.menuItem.create({
      data: {
        restaurantId,
        categoryId: fallbackCategory.id,
        name: 'Venta Histórica',
        price: 0,
        isAvailable: false,
        description: 'Producto agregador para ventas históricas importadas de productos descontinuados.',
      },
    });
    console.log(`   MenuItem "Venta Histórica" creado (isAvailable=false).`);
  } else {
    console.log(`   Reutilizando MenuItem existente (id=${fallbackProduct.id}).`);
  }

  // ── Real import ────────────────────────────────────────────────────────
  console.log('\n🚀 Generando órdenes sintéticas...');

  // Extract date range from CSV filename (item-sales-summary-YYYY-MM-DD-YYYY-MM-DD.csv)
  const fnameMatch = path.basename(csvPath).match(/(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})/);
  const startDate = fnameMatch ? new Date(fnameMatch[1]) : new Date('2022-04-13');
  const endDate = fnameMatch ? new Date(fnameMatch[2]) : new Date();
  console.log(`   Distribuyendo en: ${startDate.toISOString().slice(0,10)} → ${endDate.toISOString().slice(0,10)}`);

  // Expand: una entrada por unidad vendida, con timestamp random.
  // Para no desbordar memoria con totales enormes capamos por producto.
  const MAX_UNITS_PER_PRODUCT = 500;
  const expanded = [];
  const pushUnits = (sold, menuItemId, displayName, row) => {
    const units = Math.min(sold, MAX_UNITS_PER_PRODUCT);
    const avgPrice = num(row['Ventas netas']) / Math.max(sold, 1);
    const price = avgPrice > 0 ? avgPrice : 0;
    for (let i = 0; i < units; i++) {
      expanded.push({
        menuItemId,
        name: displayName,
        price: Math.round(price * 100) / 100,
        ts: randomDateBetween(startDate, endDate),
      });
    }
  };

  for (const m of matched) {
    pushUnits(m.sold, m.item.id, m.item.name, m.row);
  }
  // Huérfanos → FK a "Venta Histórica" pero name conserva el original.
  for (const u of unmatched) {
    pushUnits(u.sold, fallbackProduct.id, u.csvName, u.row);
  }
  console.log(`   ${expanded.length.toLocaleString()} unidades a generar (incluye huérfanos mapeados a "Venta Histórica").`);

  // Sort by ts to cluster into orders by proximity.
  expanded.sort((a, b) => a.ts - b.ts);

  // Build orders: random clustering 1-5 items per order, with the order
  // timestamp being the median of its items.
  const orders = [];
  let i = 0;
  while (i < expanded.length) {
    const size = randomBetween(1, 6);
    const slice = expanded.slice(i, i + size);
    i += size;
    if (slice.length === 0) break;
    const subtotal = slice.reduce((s, x) => s + x.price, 0);
    orders.push({
      ts: slice[Math.floor(slice.length / 2)].ts,
      items: slice,
      subtotal: Math.round(subtotal * 100) / 100,
    });
  }
  console.log(`   ${orders.length.toLocaleString()} órdenes sintéticas (~${(expanded.length / orders.length).toFixed(1)} items/orden).`);

  // Bulk insert en chunks. Mantenemos $transaction por chunk para que un
  // fallo parcial haga rollback de ese chunk, pero subimos el timeout a
  // 60s (default 5s era insuficiente — P2028 con chunks de 200).
  const CHUNK = 50;
  let created = 0, errors = 0;
  const importBatchId = `HIST-${Date.now()}`;
  for (let c = 0; c < orders.length; c += CHUNK) {
    const chunk = orders.slice(c, c + CHUNK);
    try {
      await prisma.$transaction(
        chunk.map((o, idx) => {
          const orderNumber = `${importBatchId}-${(c + idx).toString().padStart(6, '0')}`;
          return prisma.order.create({
            data: {
              restaurantId,
              orderNumber,
              status: 'DELIVERED',
              paymentMethod: pickPaymentMethod(),
              paymentStatus: 'PAID',
              subtotal: o.subtotal,
              total: o.subtotal,
              orderType: 'TAKEOUT',
              source: 'HISTORICAL_IMPORT',
              paidAt: o.ts,
              createdAt: o.ts,
              updatedAt: o.ts,
              items: {
                create: o.items.map((it) => ({
                  menuItemId: it.menuItemId,
                  name: it.name,
                  price: it.price,
                  quantity: 1,
                  subtotal: it.price,
                })),
              },
            },
          });
        }),
        { timeout: 60000, maxWait: 10000 },
      );
      created += chunk.length;
    } catch (e) {
      errors++;
      console.error(`\n   ⚠️  Chunk ${c}-${c + chunk.length} falló: ${e.code || e.message}`);
    }
    if ((created + errors * CHUNK) % 500 === 0 || c + CHUNK >= orders.length) {
      process.stdout.write(`\r   ${created.toLocaleString()} / ${orders.length.toLocaleString()} órdenes (${errors} chunks fallados)...`);
    }
  }
  console.log('\n✅ Import completado.');
  console.log(`   Batch ID: ${importBatchId}`);
  console.log(`   Para revertir: DELETE FROM orders WHERE source='HISTORICAL_IMPORT' AND "orderNumber" LIKE '${importBatchId}-%';`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
