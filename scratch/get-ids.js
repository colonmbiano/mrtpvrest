const { Client } = require('pg');
async function main() {
  const client = new Client({
    connectionString: 'postgresql://postgres:4kG._LP%40mu_y%2BwQ@db.lhkzogxrqcrrwoprydhg.supabase.co:5432/postgres'
  });
  await client.connect();
  const res = await client.query('SELECT id, name FROM restaurants LIMIT 1');
  if (res.rows.length === 0) {
    console.log('No restaurants found');
    await client.end();
    return;
  }
  const restaurantId = res.rows[0].id;
  const loc = await client.query('SELECT id, name FROM locations WHERE "restaurantId" = $1 LIMIT 1', [restaurantId]);
  console.log(JSON.stringify({
    restaurantId,
    locationId: loc.rows[0]?.id,
    name: res.rows[0].name,
    location: loc.rows[0]?.name
  }, null, 2));
  await client.end();
}
main().catch(console.error);
