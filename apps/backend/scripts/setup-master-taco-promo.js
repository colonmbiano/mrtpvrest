// Create an inactive draft. Activate only after deploying QUANTITY support.
require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const { Client } = require(require.resolve('pg', { paths: [require('path').join(__dirname, '../../../packages/database')] }));
const { randomUUID } = require('crypto');
async function main() {
  const apply = process.argv.includes('--apply');
  const db = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, statement_timeout: 12000 });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['master-burguer-s:taco-promo']);
    const restaurants = (await db.query('SELECT id,name FROM restaurants WHERE slug=$1', ['master-burguer-s'])).rows;
    if (restaurants.length !== 1) throw new Error('Restaurante no identificado');
    const rid = restaurants[0].id;
    const categories = (await db.query('SELECT id FROM categories WHERE "restaurantId"=$1 AND name=$2 AND "isActive"=true', [rid, 'Tacos'])).rows;
    if (categories.length !== 1) throw new Error('Categoría Tacos no identificada');
    const existing = (await db.query('SELECT id FROM menu_items WHERE "restaurantId"=$1 AND name=$2', [rid, 'Promo 10 Tacos'])).rows;
    if (existing.length) throw new Error('La promo ya existe; revisar antes de modificar');
    console.log(JSON.stringify({ restaurant: restaurants[0].name, product: 'Promo 10 Tacos', price: 250, category: 'Tacos', group: 'Elige tus 10 tacos', min: 10, max: 10, options: ['Pastor', 'Chuleta', 'Campechano'], available: false, mode: apply ? 'apply-draft' : 'preview' }, null, 2));
    if (!apply) { await db.query('ROLLBACK'); return; }
    const itemId = randomUUID();
    const groupId = randomUUID();
    await db.query(`INSERT INTO menu_items (id,"restaurantId","categoryId",name,description,price,"isAvailable","availableOnline","availableOnKiosk","activeDays","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,250,false,false,false,ARRAY[]::text[],now(),now())`, [itemId, rid, categories[0].id, 'Promo 10 Tacos', 'Arma tu orden con 10 tacos. Puedes combinarlos entre Pastor, Chuleta y Campechano.']);
    await db.query(`INSERT INTO modifier_groups (id,"menuItemId",name,required,"multiSelect","minSelection","maxSelection","freeModifiersLimit","groupType") VALUES ($1,$2,'Elige tus 10 tacos',true,true,10,10,0,'QUANTITY')`, [groupId, itemId]);
    for (const name of ['Pastor', 'Chuleta', 'Campechano']) await db.query(`INSERT INTO modifiers (id,"groupId",name,"priceAdd","isAvailable") VALUES ($1,$2,$3,0,true)`, [randomUUID(), groupId, name]);
    await db.query('COMMIT');
    console.log(JSON.stringify({ itemId, groupId, state: 'inactive-draft' }));
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
